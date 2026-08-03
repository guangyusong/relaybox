import "server-only";

import {
  DescribeTableCommand,
  type GlobalSecondaryIndexDescription,
  type KeySchemaElement,
  type TableDescription,
} from "@aws-sdk/client-dynamodb";
import { dynamo, requireAwsValue } from "@/lib/aws";
import { appConfig } from "@/lib/config";

type QuerySource =
  | {
      kind: "table";
      hashKey: string;
    }
  | {
      kind: "index";
      hashKey: string;
      indexName: string;
    };

type MessageLookupSource =
  | {
      kind: "table";
      keyName: string;
    }
  | {
      kind: "index";
      hashKey: string;
      indexName: string;
    };

export interface MessageTableAccess {
  listMessages: QuerySource;
  getMessage: MessageLookupSource;
}

let cachedMessageTableAccess: Promise<MessageTableAccess> | null = null;

export async function getMessageTableAccess(): Promise<MessageTableAccess> {
  if (!cachedMessageTableAccess) {
    cachedMessageTableAccess = loadMessageTableAccess().catch((error) => {
      cachedMessageTableAccess = null;
      throw error;
    });
  }

  return cachedMessageTableAccess;
}

export function resolveMessageTableAccess(
  table: Pick<TableDescription, "GlobalSecondaryIndexes" | "KeySchema">,
  preferredIndexName: string
): MessageTableAccess {
  const tableHashKey = getHashKey(table.KeySchema);
  const indexes = table.GlobalSecondaryIndexes ?? [];

  const preferredIndex =
    indexes.find((index) => index.IndexName === preferredIndexName) ?? null;

  const listMessages: QuerySource | null =
    toQuerySource(preferredIndex) ??
    indexes
      .map((index) => ({
        index,
        score: scoreMailboxIndex(index),
      }))
      .filter(
        (candidate): candidate is {
          index: GlobalSecondaryIndexDescription;
          score: number;
        } => candidate.score > 0
      )
      .sort((left, right) => right.score - left.score)
      .map((candidate) => toQuerySource(candidate.index))
      .find((candidate): candidate is QuerySource => candidate !== null) ??
    (tableHashKey === "mailbox_address" || tableHashKey === "inbox_id"
      ? {
          kind: "table",
          hashKey: tableHashKey,
        }
      : null);

  if (!listMessages) {
    throw new Error(
      "Unable to find a mailbox query path for AWS_MESSAGES_TABLE"
    );
  }

  const getMessage: MessageLookupSource | null =
    tableHashKey === "message_id"
      ? {
          kind: "table",
          keyName: "message_id",
        }
      : indexes
          .map((index) => toMessageLookupSource(index))
          .find(
            (candidate): candidate is MessageLookupSource => candidate !== null
          ) ?? null;

  if (!getMessage) {
    throw new Error(
      "Unable to find a message lookup path for AWS_MESSAGES_TABLE"
    );
  }

  return {
    listMessages,
    getMessage,
  };
}

export function inferMessageTableAccess(
  preferredIndexName: string
): MessageTableAccess | null {
  if (preferredIndexName === "byMailbox") {
    return {
      listMessages: {
        kind: "index",
        hashKey: "mailbox_address",
        indexName: preferredIndexName,
      },
      getMessage: {
        kind: "table",
        keyName: "message_id",
      },
    };
  }

  if (preferredIndexName === "by_inbox_received_at") {
    return {
      listMessages: {
        kind: "index",
        hashKey: "inbox_id",
        indexName: preferredIndexName,
      },
      getMessage: {
        kind: "index",
        hashKey: "message_id",
        indexName: "by_message_id",
      },
    };
  }

  return null;
}

async function loadMessageTableAccess(): Promise<MessageTableAccess> {
  const tableName = requireAwsValue(
    appConfig.aws.messagesTable,
    "AWS_MESSAGES_TABLE"
  );

  try {
    const result = await dynamo.send(
      new DescribeTableCommand({
        TableName: tableName,
      })
    );

    const table = result.Table;
    if (!table) {
      throw new Error(`Unable to describe table ${tableName}`);
    }

    return resolveMessageTableAccess(
      table,
      appConfig.aws.messagesByMailboxIndex
    );
  } catch (error) {
    if (!isAccessDeniedError(error)) {
      throw error;
    }

    const inferredAccess = inferMessageTableAccess(
      appConfig.aws.messagesByMailboxIndex
    );
    if (!inferredAccess) {
      throw new Error(
        `DescribeTable on ${tableName} was denied and AWS_MESSAGES_BY_MAILBOX_INDEX=${appConfig.aws.messagesByMailboxIndex} is not a supported inferred schema.`
      );
    }

    console.warn(
      "Falling back to inferred AWS message table access because DescribeTable on AWS_MESSAGES_TABLE was denied."
    );

    return inferredAccess;
  }
}

function toQuerySource(
  index: GlobalSecondaryIndexDescription | null
): QuerySource | null {
  if (!index?.IndexName) return null;

  const hashKey = getHashKey(index.KeySchema);
  if (hashKey !== "mailbox_address" && hashKey !== "inbox_id") {
    return null;
  }

  return {
    kind: "index",
    hashKey,
    indexName: index.IndexName,
  };
}

function toMessageLookupSource(
  index: GlobalSecondaryIndexDescription
): MessageLookupSource | null {
  if (!index.IndexName) return null;

  const hashKey = getHashKey(index.KeySchema);
  if (hashKey !== "message_id") {
    return null;
  }

  return {
    kind: "index",
    hashKey,
    indexName: index.IndexName,
  };
}

function scoreMailboxIndex(index: GlobalSecondaryIndexDescription): number {
  const hashKey = getHashKey(index.KeySchema);
  if (hashKey !== "mailbox_address" && hashKey !== "inbox_id") {
    return 0;
  }

  const rangeKey = getRangeKey(index.KeySchema);

  if (hashKey === "mailbox_address" && rangeKey === "received_at") return 50;
  if (hashKey === "mailbox_address") return 40;
  if (hashKey === "inbox_id" && rangeKey === "received_at") return 30;
  return 20;
}

function getHashKey(
  keySchema: KeySchemaElement[] | undefined
): string | null {
  return (
    keySchema?.find((key) => key.KeyType === "HASH")?.AttributeName ?? null
  );
}

function getRangeKey(
  keySchema: KeySchemaElement[] | undefined
): string | null {
  return (
    keySchema?.find((key) => key.KeyType === "RANGE")?.AttributeName ?? null
  );
}

function isAccessDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    Code?: unknown;
    message?: unknown;
  };

  if (
    candidate.name === "AccessDeniedException" ||
    candidate.code === "AccessDeniedException" ||
    candidate.Code === "AccessDeniedException"
  ) {
    return true;
  }

  return (
    typeof candidate.message === "string" &&
    candidate.message.includes("not authorized to perform: dynamodb:DescribeTable")
  );
}
