import { describe, expect, it } from "vitest";
import {
  inferMessageTableAccess,
  resolveMessageTableAccess,
} from "@/lib/providers/aws/schema";

describe("resolveMessageTableAccess", () => {
  it("supports the generic OSS schema", () => {
    const access = resolveMessageTableAccess(
      {
        KeySchema: [{ AttributeName: "message_id", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byMailbox",
            KeySchema: [
              { AttributeName: "mailbox_address", KeyType: "HASH" },
              { AttributeName: "received_at", KeyType: "RANGE" },
            ],
          },
        ],
      },
      "byMailbox"
    );

    expect(access).toEqual({
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
  });

  it("supports the alternate legacy schema", () => {
    const access = resolveMessageTableAccess(
      {
        KeySchema: [
          { AttributeName: "inbox_id", KeyType: "HASH" },
          { AttributeName: "message_id", KeyType: "RANGE" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "by_inbox_received_at",
            KeySchema: [
              { AttributeName: "inbox_id", KeyType: "HASH" },
              { AttributeName: "received_at", KeyType: "RANGE" },
            ],
          },
          {
            IndexName: "by_message_id",
            KeySchema: [
              { AttributeName: "message_id", KeyType: "HASH" },
              { AttributeName: "inbox_id", KeyType: "RANGE" },
            ],
          },
        ],
      },
      "byMailbox"
    );

    expect(access).toEqual({
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
  });

  it("infers the generic OSS schema from the configured mailbox index", () => {
    expect(inferMessageTableAccess("byMailbox")).toEqual({
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
  });

  it("infers the legacy schema from the configured mailbox index", () => {
    expect(inferMessageTableAccess("by_inbox_received_at")).toEqual({
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
  });

  it("returns null for unsupported inferred schemas", () => {
    expect(inferMessageTableAccess("custom-index")).toBeNull();
  });
});
