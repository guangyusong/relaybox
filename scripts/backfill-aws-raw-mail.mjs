#!/usr/bin/env node

import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { simpleParser } from "mailparser";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=", 2)[1], 10) : Number.POSITIVE_INFINITY;

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const bucket = required("AWS_S3_BUCKET");
const prefix = process.env.AWS_S3_PREFIX || "raw/";
const inboxesTable = required("AWS_MAILBOXES_TABLE");
const messagesTable = required("AWS_MESSAGES_TABLE");
const retentionDays = Number.parseInt(process.env.MESSAGE_RETENTION_DAYS || "30", 10);
const configuredAddresses = csv(process.env.APP_INBOUND_ADDRESSES).map((address) => address.toLowerCase());

if (configuredAddresses.length === 0) {
  throw new Error("APP_INBOUND_ADDRESSES must include the addresses to backfill");
}

const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

let scanned = 0;
let matched = 0;
let written = 0;
let skipped = 0;

for await (const object of listRawObjects()) {
  if (!object.Key || object.Key.endsWith("AMAZON_SES_SETUP_NOTIFICATION")) {
    skipped += 1;
    continue;
  }

  if (scanned >= limit) break;
  scanned += 1;

  const raw = await getRawObject(object.Key);
  const parsed = await simpleParser(Buffer.from(raw));
  const recipients = recipientEmails(parsed);
  const targets = configuredAddresses.filter((address) => recipients.has(address));

  if (targets.length === 0) {
    skipped += 1;
    continue;
  }

  matched += 1;
  const messageId = object.Key.slice(prefix.length);
  const receivedAt = Math.floor((object.LastModified ?? parsed.date ?? new Date()).getTime() / 1000);
  const expiresAt = receivedAt + retentionDays * 24 * 60 * 60;

  for (const target of targets) {
    const item = {
      inbox_id: target,
      mailbox_address: target,
      recipient: target,
      message_id: messageId,
      direction: "inbound",
      received_at: receivedAt,
      expires_at: expiresAt,
      source: parsed.from?.text ?? "",
      subject: parsed.subject ?? "",
      from: addressValues(parsed.from?.value),
      to: addressValues(parsed.to?.value),
      cc: addressValues(parsed.cc?.value),
      reply_to: addressValues(parsed.replyTo?.value),
      internet_message_id: parsed.messageId ?? null,
      date: parsed.date ? Math.floor(parsed.date.getTime() / 1000) : null,
      has_text: Boolean(parsed.text),
      has_html: Boolean(parsed.html),
      body_preview: previewText(parsed.text || (typeof parsed.html === "string" ? parsed.html : "")),
      attachment_count: parsed.attachments.length,
      attachment_total_size: parsed.attachments.reduce((sum, attachment) => sum + attachment.size, 0),
      recipients: [...recipients],
      s3_bucket: bucket,
      s3_key: object.Key,
      raw_size: object.Size ?? raw.length,
    };

    if (dryRun) {
      console.log(`would write ${messageId} -> ${target}`);
      continue;
    }

    await ensureInbox(target);
    await ddb.send(
      new PutCommand({
        TableName: messagesTable,
        Item: item,
      })
    );
    written += 1;
  }
}

console.log(
  JSON.stringify({ dryRun, scanned, matched, written, skipped }, null, 2)
);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function csv(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function* listRawObjects() {
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    for (const object of page.Contents ?? []) {
      yield object;
    }

    token = page.NextContinuationToken;
  } while (token);
}

async function getRawObject(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Unable to read s3://${bucket}/${key}`);
  }
  return bytes;
}

async function ensureInbox(address) {
  await ddb.send(
    new UpdateCommand({
      TableName: inboxesTable,
      Key: { inbox_id: address },
      UpdateExpression:
        "SET address = if_not_exists(address, :address), #status = if_not_exists(#status, :status), #type = if_not_exists(#type, :type)",
      ExpressionAttributeNames: {
        "#status": "status",
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":address": address,
        ":status": "active",
        ":type": "address",
      },
    })
  );
}

function recipientEmails(parsed) {
  const values = [
    ...addressValues(parsed.to?.value),
    ...addressValues(parsed.cc?.value),
    ...addressValues(parsed.bcc?.value),
    ...headerEmails(parsed.headers.get("delivered-to")),
    ...headerEmails(parsed.headers.get("x-original-to")),
    ...headerEmails(parsed.headers.get("envelope-to")),
  ];

  return new Set(values.map((entry) => entry.email.toLowerCase()));
}

function addressValues(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const email = entry?.address?.trim();
    if (!email) return [];
    return [{ name: entry.name?.trim() || "", email }];
  });
}

function headerEmails(value) {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) =>
    String(item)
      .split(/[,\s]+/)
      .map((candidate) => candidate.trim().replace(/[<>]/g, ""))
      .filter((candidate) => candidate.includes("@"))
      .map((email) => ({ name: "", email }))
  );
}

function previewText(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}
