import { SendRawEmailCommand } from "@aws-sdk/client-ses";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ddbSend: vi.fn(),
  sesSend: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  appConfig: {
    fromAddresses: ["agent@example.com", "hello@example.com"],
    aws: {
      messagesTable: "messages",
    },
  },
}));

vi.mock("@/lib/aws", () => ({
  ddb: {
    send: mocks.ddbSend,
  },
  requireAwsValue: (value: string | undefined, label: string) => {
    if (!value) {
      throw new Error(`${label} is required when MAIL_PROVIDER=aws`);
    }

    return value;
  },
  ses: {
    send: mocks.sesSend,
  },
}));

import { awsOutboundProvider } from "@/lib/providers/aws/outbound";

describe("awsOutboundProvider", () => {
  beforeEach(() => {
    mocks.ddbSend.mockReset();
    mocks.sesSend.mockReset();
  });

  it("sends through SES and stores an outbound copy", async () => {
    mocks.sesSend.mockResolvedValue({ MessageId: "ses-message-id" });
    mocks.ddbSend.mockResolvedValue({});

    const result = await awsOutboundProvider.sendMessage({
      from: "agent@example.com",
      to: ["recipient@example.net"],
      cc: ["observer@example.org"],
      subject: "Re: Relaybox mail test",
      body: "Reply body\n\nSecond line",
      replyToMessageId: "<original@example.com>",
    });

    expect(result).toEqual({ messageId: "ses-message-id" });

    const sesCommand = mocks.sesSend.mock.calls[0]?.[0];
    expect(sesCommand).toBeInstanceOf(SendRawEmailCommand);
    expect(sesCommand.input).toMatchObject({
      Source: "agent@example.com",
      Destinations: ["recipient@example.net", "observer@example.org"],
    });

    const putCommand = mocks.ddbSend.mock.calls[0]?.[0];
    expect(putCommand).toBeInstanceOf(PutCommand);
    expect(putCommand.input).toMatchObject({
      TableName: "messages",
      Item: {
        inbox_id: "agent@example.com",
        mailbox_address: "agent@example.com",
        message_id: "ses-message-id",
        direction: "outbound",
        subject: "Re: Relaybox mail test",
        from: [{ name: "", email: "agent@example.com" }],
        to: [{ name: "", email: "recipient@example.net" }],
        cc: [{ name: "", email: "observer@example.org" }],
        in_reply_to: "<original@example.com>",
        references: ["<original@example.com>"],
        body_preview: "Reply body Second line",
        text: "Reply body\n\nSecond line",
        status: "sent",
      },
    });
  });

  it("rejects unconfigured sender addresses", async () => {
    await expect(
      awsOutboundProvider.sendMessage({
        from: "unknown@example.com",
        to: ["recipient@example.net"],
        cc: [],
        subject: "Nope",
        body: "Body",
      })
    ).rejects.toThrow("Not allowed to send as unknown@example.com");

    expect(mocks.sesSend).not.toHaveBeenCalled();
    expect(mocks.ddbSend).not.toHaveBeenCalled();
  });
});
