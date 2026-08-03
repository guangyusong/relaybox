import { SendRawEmailCommand } from "@aws-sdk/client-ses";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, requireAwsValue, ses } from "@/lib/aws";
import { appConfig } from "@/lib/config";
import type { SendMessageInput } from "@/lib/mail-types";
import type { OutboundProvider } from "@/lib/providers/types";

export const awsOutboundProvider: OutboundProvider = {
  async listSenderIdentities() {
    return appConfig.fromAddresses;
  },

  async sendMessage(input) {
    if (!appConfig.fromAddresses.includes(input.from)) {
      throw new Error(`Not allowed to send as ${input.from}`);
    }

    const rawMessage = buildRawMessage(input);
    const response = await ses.send(
      new SendRawEmailCommand({
        Source: input.from,
        Destinations: [...input.to, ...input.cc],
        RawMessage: {
          Data: Buffer.from(rawMessage, "utf8"),
        },
      })
    );

    const messageId = response.MessageId ?? `aws-${randomUUID()}`;
    await storeOutboundMessage(input, messageId);

    return {
      messageId,
    };
  },
};

async function storeOutboundMessage(input: SendMessageInput, messageId: string) {
  const now = Math.floor(Date.now() / 1000);
  const retentionDays = 30;
  const bodySize = Buffer.byteLength(input.body, "utf8");

  await ddb.send(
    new PutCommand({
      TableName: requireAwsValue(appConfig.aws.messagesTable, "AWS_MESSAGES_TABLE"),
      Item: {
        inbox_id: input.from,
        mailbox_address: input.from,
        message_id: messageId,
        direction: "outbound",
        received_at: now,
        sent_at: now,
        expires_at: now + retentionDays * 24 * 60 * 60,
        subject: input.subject,
        from: [{ name: "", email: input.from }],
        to: input.to.map((email) => ({ name: "", email })),
        cc: input.cc.map((email) => ({ name: "", email })),
        reply_to: [],
        in_reply_to: input.replyToMessageId ?? null,
        references: input.replyToMessageId ? [input.replyToMessageId] : [],
        body_preview: input.body.trim().replace(/\s+/g, " ").slice(0, 500),
        text: input.body,
        has_text: true,
        has_html: false,
        attachment_count: 0,
        attachment_total_size: 0,
        raw_size: bodySize,
        size: bodySize,
        status: "sent",
      },
    })
  );
}

function buildRawMessage(input: SendMessageInput): string {
  const headers = [
    `From: ${sanitizeHeader(input.from)}`,
    `To: ${input.to.map(sanitizeHeader).join(", ")}`,
    ...(input.cc.length > 0
      ? [`Cc: ${input.cc.map(sanitizeHeader).join(", ")}`]
      : []),
    `Subject: ${sanitizeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "X-Mailer: Relaybox",
    ...(input.replyToMessageId
      ? [
          `In-Reply-To: ${sanitizeHeader(input.replyToMessageId)}`,
          `References: ${sanitizeHeader(input.replyToMessageId)}`,
        ]
      : []),
  ];

  const normalizedBody = input.body.replace(/\r?\n/g, "\r\n");

  return [...headers, "", normalizedBody].join("\r\n");
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
