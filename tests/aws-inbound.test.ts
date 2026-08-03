import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getMessageTableAccess: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  appConfig: {
    inboundAddresses: ["agent@example.com", "ops@example.com"],
    aws: {
      mailboxesTable: "mailboxes",
      messagesTable: "messages",
      messagesByMailboxIndex: "byMailbox",
    },
  },
}));

vi.mock("@/lib/aws", () => ({
  ddb: {
    send: mocks.send,
  },
  requireAwsValue: (value: string | undefined, label: string) => {
    if (!value) {
      throw new Error(`${label} is required when MAIL_PROVIDER=aws`);
    }

    return value;
  },
}));

vi.mock("@/lib/providers/aws/schema", () => ({
  getMessageTableAccess: mocks.getMessageTableAccess,
}));

import { awsInboundProvider } from "@/lib/providers/aws/inbound";

describe("awsInboundProvider", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.getMessageTableAccess.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to configured mailboxes when Scan is denied", async () => {
    mocks.getMessageTableAccess.mockResolvedValue({
      listMessages: {
        kind: "index",
        hashKey: "mailbox_address",
        indexName: "byMailbox",
      },
      getMessage: {
        kind: "table",
        keyName: "message_id",
      },
    });

    mocks.send.mockImplementation((command: ScanCommand | QueryCommand) => {
      if (command instanceof ScanCommand) {
        const error = new Error(
          "User is not authorized to perform: dynamodb:Scan"
        );
        error.name = "AccessDeniedException";
        return Promise.reject(error);
      }

      if (command instanceof QueryCommand) {
        return Promise.resolve({
          Count:
            command.input.ExpressionAttributeValues?.[":mailbox"] ===
            "agent@example.com"
              ? 2
              : 0,
        });
      }

      return Promise.reject(new Error("Unexpected command"));
    });

    await expect(awsInboundProvider.listMailboxes()).resolves.toEqual([
      {
        address: "agent@example.com",
        messageCount: 2,
        status: "active",
        type: "address",
      },
      {
        address: "ops@example.com",
        messageCount: 0,
        status: "active",
        type: "address",
      },
    ]);

    expect(console.warn).toHaveBeenCalledWith(
      "Falling back to configured mailboxes because Scan on AWS_MAILBOXES_TABLE was denied."
    );
  });

  it("prefers scanned mailbox metadata when counts tie", async () => {
    mocks.getMessageTableAccess.mockResolvedValue({
      listMessages: {
        kind: "index",
        hashKey: "mailbox_address",
        indexName: "byMailbox",
      },
      getMessage: {
        kind: "table",
        keyName: "message_id",
      },
    });

    mocks.send.mockImplementation((command: ScanCommand | QueryCommand) => {
      if (command instanceof ScanCommand) {
        return Promise.resolve({
          Items: [
            {
              address: "agent@example.com",
              type: "agent",
              status: "disabled",
              message_count: 0,
            },
          ],
        });
      }

      if (command instanceof QueryCommand) {
        return Promise.resolve({ Count: 0 });
      }

      return Promise.reject(new Error("Unexpected command"));
    });

    await expect(awsInboundProvider.listMailboxes()).resolves.toEqual([
      {
        address: "agent@example.com",
        messageCount: 0,
        status: "disabled",
        type: "agent",
      },
      {
        address: "ops@example.com",
        messageCount: 0,
        status: "active",
        type: "address",
      },
    ]);
  });
});
