import { GetObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { simpleParser } from "mailparser";
import { appConfig } from "@/lib/config";
import type {
  Labels,
  MessageAttachment,
  MessageDetail,
  MessageSummary,
} from "@/lib/mail-types";
import { ddb, requireAwsValue, s3 } from "@/lib/aws";
import { getLabels, setLabel } from "@/lib/labels";
import { mailboxCandidates } from "@/lib/providers/aws/mailbox-candidates";
import { getMessageTableAccess } from "@/lib/providers/aws/schema";
import type { MessageStore } from "@/lib/providers/types";

export const awsMessageStore: MessageStore = {
  async listMessages(mailboxAddress) {
    const labels = await getLabels();
    const tableName = requireAwsValue(
      appConfig.aws.messagesTable,
      "AWS_MESSAGES_TABLE"
    );
    const access = await getMessageTableAccess();

    const result = await queryMessagesForMailbox(
      tableName,
      access.listMessages,
      mailboxAddress
    );

    return (result.Items ?? [])
      .map((item) => toSummary(item as Record<string, unknown>, labels))
      .sort(sortByDateDesc);
  },

  async getMessage(messageId, mailboxAddress) {
    const labels = await getLabels();
    const tableName = requireAwsValue(
      appConfig.aws.messagesTable,
      "AWS_MESSAGES_TABLE"
    );
    const access = await getMessageTableAccess();

    const item = await getMessageItem(
      tableName,
      access.getMessage,
      messageId,
      mailboxAddress
    );
    if (!item) {
      return null;
    }

    const detail = await hydrateDetail(item, labels);
    return detail;
  },

  getLabels,
  setLabel,
};

async function queryMessagesForMailbox(
  tableName: string,
  source: Awaited<ReturnType<typeof getMessageTableAccess>>["listMessages"],
  mailboxAddress: string
) {
  for (const candidate of mailboxCandidates(mailboxAddress, source.hashKey)) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        ...(source.kind === "index" && {
          IndexName: source.indexName,
        }),
        KeyConditionExpression: `${source.hashKey} = :mailbox`,
        ExpressionAttributeValues: {
          ":mailbox": candidate,
        },
        ScanIndexForward: false,
      })
    );

    if ((result.Items ?? []).length > 0) {
      return result;
    }
  }

  return ddb.send(
    new QueryCommand({
      TableName: tableName,
      ...(source.kind === "index" && {
        IndexName: source.indexName,
      }),
      KeyConditionExpression: `${source.hashKey} = :mailbox`,
      ExpressionAttributeValues: {
        ":mailbox": mailboxAddress,
      },
      ScanIndexForward: false,
    })
  );
}

async function getMessageItem(
  tableName: string,
  source: Awaited<ReturnType<typeof getMessageTableAccess>>["getMessage"],
  messageId: string,
  mailboxAddress?: string
): Promise<Record<string, unknown> | undefined> {
  if (source.kind === "table") {
    const result = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { [source.keyName]: messageId },
      })
    );

    return result.Item as Record<string, unknown> | undefined;
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: source.indexName,
      KeyConditionExpression: `${source.hashKey} = :messageId`,
      ExpressionAttributeValues: {
        ":messageId": messageId,
      },
      Limit: mailboxAddress ? 25 : 1,
    })
  );

  const items = (result.Items ?? []) as Record<string, unknown>[];
  if (!mailboxAddress) {
    return items[0];
  }

  const mailboxSet = new Set([
    mailboxAddress,
    ...mailboxCandidates(mailboxAddress, "inbox_id"),
  ]);

  return items.find((item) => {
    const mailbox =
      readString(item.inbox_id) ??
      readString(item.mailbox_address) ??
      readString(item.address);
    return Boolean(mailbox && mailboxSet.has(mailbox));
  });
}

async function hydrateDetail(
  item: Record<string, unknown>,
  labels: Labels
): Promise<MessageDetail> {
  const summary = toSummary(item, labels);
  const s3Key = readString(item.s3_key);

  if (!s3Key || !appConfig.aws.s3Bucket) {
    return {
      ...summary,
      text: readString(item.text) ?? "",
      html: readString(item.html),
      headers: {
        replyTo: readString(item.reply_to_text),
        messageId: readString(item.header_message_id),
      },
      attachments: readAttachments(item.attachments),
      ses: readSes(item.ses),
    };
  }

  const object = await s3.send(
    new GetObjectCommand({
      Bucket: requireAwsValue(appConfig.aws.s3Bucket, "AWS_S3_BUCKET"),
      Key: s3Key,
    })
  );

  const raw = await object.Body?.transformToByteArray();
  if (!raw) {
    return {
      ...summary,
      text: readString(item.text) ?? "",
      html: readString(item.html),
      headers: {
        replyTo: readString(item.reply_to_text),
        messageId: readString(item.header_message_id),
      },
      attachments: readAttachments(item.attachments),
      ses: readSes(item.ses),
    };
  }

  const parsed = await simpleParser(Buffer.from(raw));

  return {
    ...summary,
    text: readString(item.text) ?? parsed.text ?? "",
    html:
      readString(item.html) ??
      (typeof parsed.html === "string" ? parsed.html : null),
    headers: {
      replyTo: readString(item.reply_to_text) ?? parsed.replyTo?.text ?? null,
      messageId:
        readString(item.header_message_id) ?? parsed.messageId ?? null,
    },
    attachments: (() => {
      const storedAttachments = readAttachments(item.attachments);
      if (storedAttachments.length > 0) {
        return storedAttachments;
      }

      return (parsed.attachments ?? []).map((attachment) => ({
        filename: attachment.filename ?? null,
        contentType: attachment.contentType,
        size: attachment.size,
      }));
    })(),
    ses: readSes(item.ses),
  };
}

function toSummary(
  item: Record<string, unknown>,
  labels: Labels
): MessageSummary {
  const messageId = readString(item.message_id) ?? readString(item.id) ?? "";
  const mailboxAddress = readMailboxAddress(item);

  return {
    messageId,
    mailboxAddress,
    direction: readString(item.direction) ?? undefined,
    from:
      readAddressList(item.from) ??
      readString(item.from_text) ??
      readString(item.from) ??
      "",
    to:
      readAddressList(item.to) ??
      readString(item.to_text) ??
      readString(item.to) ??
      "",
    subject: readString(item.subject) ?? "(no subject)",
    date: readDate(item.received_at) ?? readDate(item.date),
    size: readNumber(item.size) ?? readNumber(item.raw_size) ?? 0,
    replyTo: readAddressList(item.reply_to) ?? readString(item.reply_to_text),
    label: labels[messageId],
    bodyPreview: readBodyPreview(item),
    attachmentCount:
      readNumber(item.attachment_count) ?? readAttachments(item.attachments).length,
    readAt: null,
    unread: false,
    starred: false,
    archived: false,
  };
}

function readMailboxAddress(item: Record<string, unknown>): string {
  const explicit =
    readString(item.mailbox_address) ?? readString(item.address);
  if (explicit) return explicit;

  const inboxId = readString(item.inbox_id);
  if (!inboxId) return "";

  const configuredMatch = appConfig.inboundAddresses.find(
    (address) =>
      address === inboxId ||
      address.startsWith(`${inboxId}@`) ||
      address.endsWith(`@${inboxId}`)
  );
  if (configuredMatch) return configuredMatch;

  return inboxId;
}

function readAddressList(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const candidate = item as Record<string, unknown>;
    const email = readString(candidate.email);
    if (!email) return [];

    const name = readString(candidate.name);
    return [name ? `${name} <${email}>` : email];
  });

  return entries.length > 0 ? entries.join(", ") : null;
}

function readAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;

    return [
      {
        filename:
          typeof attachment.filename === "string"
            ? attachment.filename
            : null,
        contentType:
          readString(attachment.contentType) ??
          readString(attachment.content_type) ??
          "application/octet-stream",
        size:
          typeof attachment.size === "number" && Number.isFinite(attachment.size)
            ? attachment.size
            : 0,
      },
    ];
  });
}

function readBodyPreview(item: Record<string, unknown>): string {
  const stored = readString(item.body_preview);
  if (stored) return stored;

  const text = readString(item.text);
  if (!text) return "";

  return text.trim().replace(/\s+/g, " ").slice(0, 180);
}

function readSes(
  value: unknown
): Record<string, { status: string }> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, { status: string }>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDate(value: unknown): string | null {
  const asString = readString(value);
  if (asString) return asString;

  const asNumber = readNumber(value);
  if (asNumber === null) return null;

  const timestamp = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export const awsMessageStoreInternals = {
  readAddressList,
  readMailboxAddress,
  toSummary,
};

function sortByDateDesc(
  a: { date: string | null },
  b: { date: string | null }
): number {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}
