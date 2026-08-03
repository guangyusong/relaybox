import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  appConfig: {
    aws: {
      messagesTable: "messages",
      messagesByMailboxIndex: "by_inbox_received_at",
    },
  },
}));

vi.mock("@/lib/aws", () => ({
  dynamo: {
    send: mocks.send,
  },
  requireAwsValue: (value: string | undefined, label: string) => {
    if (!value) {
      throw new Error(`${label} is required when MAIL_PROVIDER=aws`);
    }

    return value;
  },
}));

describe("getMessageTableAccess", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to inferred schema when DescribeTable is denied", async () => {
    const error = new Error(
      "User is not authorized to perform: dynamodb:DescribeTable"
    );
    error.name = "AccessDeniedException";
    mocks.send.mockRejectedValue(error);

    const { getMessageTableAccess } = await import(
      "@/lib/providers/aws/schema"
    );

    await expect(getMessageTableAccess()).resolves.toEqual({
      listMessages: {
        kind: "index",
        hashKey: "inbox_id",
        indexName: "by_inbox_received_at",
      },
      getMessage: {
        kind: "index",
        hashKey: "message_id",
        indexName: "by_message_id",
      },
    });

    expect(console.warn).toHaveBeenCalledWith(
      "Falling back to inferred AWS message table access because DescribeTable on AWS_MESSAGES_TABLE was denied."
    );
  });
});
