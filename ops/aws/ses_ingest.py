import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime

import boto3

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
sqs = boto3.client("sqs")

INBOXES_TABLE = os.environ["INBOXES_TABLE"]
MESSAGES_TABLE = os.environ["MESSAGES_TABLE"]
INBOUND_BUCKET = os.environ["INBOUND_BUCKET"]
INBOUND_PREFIX = os.environ.get("INBOUND_PREFIX", "raw/")
PARSED_PREFIX = os.environ.get("PARSED_PREFIX", "parsed/")
ATTACHMENTS_PREFIX = os.environ.get("ATTACHMENTS_PREFIX", "attachments/")
INBOX_DOMAIN = os.environ["INBOX_DOMAIN"].lower()
INBOX_DOMAINS = {
  value.strip().lower()
  for value in os.environ.get("INBOX_DOMAINS", INBOX_DOMAIN).split(",")
  if value.strip()
}
DIRECT_INBOX_ADDRESSES = {
  value.strip().lower()
  for value in os.environ.get("DIRECT_INBOX_ADDRESSES", "").split(",")
  if value.strip()
}
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "30"))
EVENTS_QUEUE_URL = os.environ.get("EVENTS_QUEUE_URL", "").strip()
DELETE_UNMATCHED_RAW = os.environ.get("DELETE_UNMATCHED_RAW", "false").lower() == "true"
MAX_ATTACHMENT_BYTES = int(os.environ.get("MAX_ATTACHMENT_BYTES", str(10 * 1024 * 1024)))
MAX_TOTAL_ATTACHMENT_BYTES = int(os.environ.get("MAX_TOTAL_ATTACHMENT_BYTES", str(15 * 1024 * 1024)))
MAX_ATTACHMENTS = int(os.environ.get("MAX_ATTACHMENTS", "20"))

inboxes_table = dynamodb.Table(INBOXES_TABLE)
messages_table = dynamodb.Table(MESSAGES_TABLE)


def _parse_timestamp(ts: Optional[str]) -> int:
  if not ts:
    return int(datetime.now(tz=timezone.utc).timestamp())
  try:
    if ts.endswith("Z"):
      ts = ts[:-1] + "+00:00"
    return int(datetime.fromisoformat(ts).astimezone(timezone.utc).timestamp())
  except Exception:
    return int(datetime.now(tz=timezone.utc).timestamp())


def _split_recipient(recipient: str) -> Optional[Tuple[str, str]]:
  recipient = (recipient or "").strip().lower()
  if "@" not in recipient:
    return None
  local_part, domain = recipient.split("@", 1)
  if not local_part or not domain:
    return None
  return local_part, domain


def _get_active_inbox(inbox_id: str) -> Optional[Dict[str, Any]]:
  resp = inboxes_table.get_item(Key={"inbox_id": inbox_id})
  item = resp.get("Item")
  if not item or item.get("status") != "active":
    return None
  return item


def _ensure_direct_inbox(address: str) -> Dict[str, Any]:
  existing = inboxes_table.get_item(Key={"inbox_id": address}).get("Item")
  if existing:
    return existing

  inboxes_table.put_item(
    Item={
      "inbox_id": address,
      "address": address,
      "status": "active",
      "type": "address",
    }
  )

  return {
    "inbox_id": address,
    "address": address,
    "status": "active",
    "type": "address",
  }


def _head_raw_object(bucket: str, key: str) -> Optional[Dict[str, Any]]:
  try:
    return s3.head_object(Bucket=bucket, Key=key)
  except Exception:
    return None


def _get_raw_bytes(bucket: str, key: str) -> Optional[bytes]:
  try:
    resp = s3.get_object(Bucket=bucket, Key=key)
    body = resp.get("Body")
    if not body:
      return None
    return body.read()
  except Exception:
    return None


def _addr_list(header_value: Optional[str]) -> List[Dict[str, str]]:
  if not header_value:
    return []
  out: List[Dict[str, str]] = []
  for name, email in getaddresses([header_value]):
    email = (email or "").strip()
    if not email:
      continue
    out.append({"name": (name or "").strip(), "email": email})
  return out


def _parse_references(value: Optional[str]) -> List[str]:
  if not value:
    return []
  refs = []
  for token in value.replace(",", " ").split():
    token = token.strip()
    if token:
      refs.append(token)
  return refs


def _parse_date(value: Optional[str]) -> Optional[int]:
  if not value:
    return None
  try:
    dt = parsedate_to_datetime(value)
    if not dt:
      return None
    if dt.tzinfo is None:
      dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.astimezone(timezone.utc).timestamp())
  except Exception:
    return None


def _put_json(bucket: str, key: str, payload: Dict[str, Any]) -> None:
  s3.put_object(
    Bucket=bucket,
    Key=key,
    Body=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
    ContentType="application/json; charset=utf-8",
    ServerSideEncryption="AES256",
  )


def _put_bytes(bucket: str, key: str, data: bytes, content_type: str) -> None:
  s3.put_object(
    Bucket=bucket,
    Key=key,
    Body=data,
    ContentType=content_type or "application/octet-stream",
    ServerSideEncryption="AES256",
  )


def _parse_and_store(
  *,
  message_id: str,
  raw_bytes: bytes,
  bucket: str,
) -> Dict[str, Any]:
  msg = BytesParser(policy=policy.default).parsebytes(raw_bytes)
  headers = {k.lower(): str(v) for (k, v) in msg.items()}

  from_list = _addr_list(msg.get("From"))
  to_list = _addr_list(msg.get("To"))
  cc_list = _addr_list(msg.get("Cc"))
  reply_to_list = _addr_list(msg.get("Reply-To"))

  internet_message_id = (msg.get("Message-ID") or "").strip() or None
  in_reply_to = (msg.get("In-Reply-To") or "").strip() or None
  references = _parse_references(msg.get("References"))
  date_ts = _parse_date(msg.get("Date"))

  text_body: Optional[str] = None
  html_body: Optional[str] = None
  attachments: List[Dict[str, Any]] = []
  total_attachment_bytes = 0
  part_index = 0

  for part in msg.walk():
    if part.is_multipart():
      continue

    content_type = (part.get_content_type() or "application/octet-stream").lower()
    filename = part.get_filename()
    disposition = part.get_content_disposition()
    content_id = (part.get("Content-ID") or "").strip().strip("<>").strip() or None

    is_attachment = bool(filename) or disposition == "attachment"
    if is_attachment:
      if len(attachments) >= MAX_ATTACHMENTS:
        continue

      data = part.get_payload(decode=True) or b""
      size = len(data)
      if size <= 0:
        continue
      if size > MAX_ATTACHMENT_BYTES:
        continue
      if total_attachment_bytes + size > MAX_TOTAL_ATTACHMENT_BYTES:
        continue

      safe_name = (
        filename or f"attachment-{part_index}"
      ).replace("\\", "_").replace("/", "_").strip() or f"attachment-{part_index}"
      att_key = f"{ATTACHMENTS_PREFIX}{message_id}/{part_index:04d}_{safe_name}"
      _put_bytes(bucket, att_key, data, content_type)

      attachments.append(
        {
          "filename": safe_name,
          "content_type": content_type,
          "size": size,
          "s3_bucket": bucket,
          "s3_key": att_key,
          "content_disposition": disposition,
          "content_id": content_id,
        }
      )
      total_attachment_bytes += size
      part_index += 1
      continue

    if content_type == "text/plain" and text_body is None:
      try:
        text_body = part.get_content()
      except Exception:
        text_body = None
      continue

    if content_type == "text/html" and html_body is None:
      try:
        html_body = part.get_content()
      except Exception:
        html_body = None
      continue

  parsed_key = f"{PARSED_PREFIX}{message_id}.json"
  parsed_payload: Dict[str, Any] = {
    "message_id": message_id,
    "internet_message_id": internet_message_id,
    "subject": (msg.get("Subject") or "").strip(),
    "date": date_ts,
    "from": from_list,
    "to": to_list,
    "cc": cc_list,
    "reply_to": reply_to_list,
    "in_reply_to": in_reply_to,
    "references": references,
    "headers": headers,
    "text": text_body,
    "html": html_body,
    "attachments": attachments,
  }
  _put_json(bucket, parsed_key, parsed_payload)

  preview_src = text_body or html_body or ""
  body_preview = preview_src.strip().replace("\r", "")[:500] if preview_src else ""

  return {
    "parsed_s3_bucket": bucket,
    "parsed_s3_key": parsed_key,
    "internet_message_id": internet_message_id,
    "in_reply_to": in_reply_to,
    "references": references,
    "from": from_list,
    "to": to_list,
    "cc": cc_list,
    "reply_to": reply_to_list,
    "date": date_ts,
    "has_text": bool(text_body),
    "has_html": bool(html_body),
    "body_preview": body_preview,
    "attachments": attachments,
    "attachment_count": len(attachments),
    "attachment_total_size": total_attachment_bytes,
  }


def _mail_targets(recipients: List[str]) -> List[Dict[str, Any]]:
  targets: List[Dict[str, Any]] = []
  seen = set()

  for recipient in recipients:
    normalized = (recipient or "").strip().lower()
    split = _split_recipient(normalized)
    if not split:
      continue

    local_part, domain = split
    if domain in INBOX_DOMAINS:
      inbox = _get_active_inbox(local_part)
      if inbox:
        key = inbox.get("inbox_id") or local_part
        if key not in seen:
          targets.append(
            {
              "inbox": inbox,
              "inbox_id": key,
              "mailbox_address": normalized,
              "recipient": normalized,
            }
          )
          seen.add(key)

    if normalized in DIRECT_INBOX_ADDRESSES:
      inbox = _ensure_direct_inbox(normalized)
      if normalized not in seen:
        targets.append(
          {
            "inbox": inbox,
            "inbox_id": normalized,
            "mailbox_address": normalized,
            "recipient": normalized,
          }
        )
        seen.add(normalized)

  return targets


def _emit_received_event(
  *,
  inbox_id: str,
  message_id: str,
  received_at: int,
  subject: str,
  project_id: Optional[str],
  parsed: Optional[Dict[str, Any]],
) -> None:
  if not EVENTS_QUEUE_URL:
    return

  try:
    sqs.send_message(
      QueueUrl=EVENTS_QUEUE_URL,
      MessageBody=json.dumps(
        {
          "type": "message.received",
          "event_id": f"inbound:{inbox_id}:{message_id}",
          "payload": {
            "project_id": project_id,
            "inbox_id": inbox_id,
            "message_id": message_id,
            "received_at": received_at,
            "subject": subject,
            "from": (parsed or {}).get("from") if parsed else None,
            "attachment_count": (parsed or {}).get("attachment_count") if parsed else None,
          },
        },
        separators=(",", ":"),
      ),
    )
  except Exception:
    pass


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
  stored = 0

  for record in event.get("Records", []):
    ses = (record or {}).get("ses") or {}
    mail = ses.get("mail") or {}
    receipt = ses.get("receipt") or {}

    message_id = mail.get("messageId")
    if not message_id:
      continue

    received_at = _parse_timestamp(mail.get("timestamp") or receipt.get("timestamp"))
    expires_at = received_at + (RETENTION_DAYS * 24 * 60 * 60)
    raw_key = f"{INBOUND_PREFIX}{message_id}"
    head = _head_raw_object(INBOUND_BUCKET, raw_key)
    raw_size = int(head.get("ContentLength", 0)) if head else 0

    source = (mail.get("source") or "").strip()
    common_headers = mail.get("commonHeaders") or {}
    subject = (common_headers.get("subject") or "").strip()
    recipients = receipt.get("recipients") or []
    if not isinstance(recipients, list):
      recipients = []

    targets = _mail_targets(recipients)
    parsed: Optional[Dict[str, Any]] = None
    parsed_error: Optional[str] = None

    if targets:
      raw_bytes = _get_raw_bytes(INBOUND_BUCKET, raw_key)
      if raw_bytes is None:
        parsed_error = "missing_raw_bytes"
      else:
        try:
          parsed = _parse_and_store(
            message_id=message_id,
            raw_bytes=raw_bytes,
            bucket=INBOUND_BUCKET,
          )
        except Exception as e:
          parsed_error = f"parse_failed:{e.__class__.__name__}"

    for target in targets:
      inbox = target["inbox"]
      inbox_id = target["inbox_id"]
      project_id = inbox.get("project_id")
      item: Dict[str, Any] = {
        "inbox_id": inbox_id,
        "message_id": message_id,
        "direction": "inbound",
        "received_at": received_at,
        "expires_at": expires_at,
        "source": source,
        "subject": subject,
        "recipients": recipients,
        "mailbox_address": target["mailbox_address"],
        "recipient": target["recipient"],
        **({"project_id": project_id} if project_id else {}),
        "s3_bucket": INBOUND_BUCKET,
        "s3_key": raw_key,
        "raw_size": raw_size,
        "ses": {
          "spamVerdict": receipt.get("spamVerdict"),
          "virusVerdict": receipt.get("virusVerdict"),
          "spfVerdict": receipt.get("spfVerdict"),
          "dkimVerdict": receipt.get("dkimVerdict"),
          "dmarcVerdict": receipt.get("dmarcVerdict"),
        },
      }
      if parsed:
        item.update(parsed)
      if parsed_error:
        item["parsed_error"] = parsed_error

      messages_table.put_item(Item=item)
      stored += 1
      _emit_received_event(
        inbox_id=inbox_id,
        message_id=message_id,
        received_at=received_at,
        subject=subject,
        project_id=project_id,
        parsed=parsed,
      )

    if not targets and DELETE_UNMATCHED_RAW:
      try:
        s3.delete_object(Bucket=INBOUND_BUCKET, Key=raw_key)
      except Exception:
        pass

  return {"ok": True, "received": len(event.get("Records", [])), "stored": stored}
