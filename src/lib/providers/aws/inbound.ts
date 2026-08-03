import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "@/lib/config";
import type { Mailbox } from "@/lib/mail-types";
import { ddb, requireAwsValue } from "@/lib/aws";
import { mailboxCandidates } from "@/lib/providers/aws/mailbox-candidates";
import { getMessageTableAccess } from "@/lib/providers/aws/schema";
import type { InboundProvider } from "@/lib/providers/types";

export const awsInboundProvider: InboundProvider = {
  async listMailboxes() {
    const tableName = requireAwsValue(
      appConfig.aws.mailboxesTable,
      "AWS_MAILBOXES_TABLE"
    );
    const scannedItems = await scanMailboxItems(tableName);

    const itemMailboxes = (
      await Promise.all(
        scannedItems.map(async (record) => {
          const mailbox = toMailbox(record);
          if (!mailbox) return null;

          if (readNumber(record.message_count) !== null) {
            return mailbox;
          }

          return {
            ...mailbox,
            messageCount: await countMessagesForMailbox(mailbox.address),
          };
        })
      )
    ).filter((mailbox): mailbox is Mailbox => mailbox !== null);

    const itemAddresses = new Set(
      itemMailboxes.map((mailbox) => mailbox.address)
    );

    const configuredMailboxes = await Promise.all(
      appConfig.inboundAddresses.map(async (address) => {
        const mailbox = createConfiguredMailbox(address);

        if (itemAddresses.has(address)) {
          return mailbox;
        }

        return {
          ...mailbox,
          messageCount: await countMessagesForMailbox(address),
        };
      })
    );

    const byAddress = new Map<string, Mailbox>();

    [...configuredMailboxes, ...itemMailboxes].forEach((mailbox) => {
      const existing = byAddress.get(mailbox.address);
      if (!existing || mailbox.messageCount >= existing.messageCount) {
        byAddress.set(mailbox.address, mailbox);
      }
    });

    return [...byAddress.values()].sort((a, b) => a.address.localeCompare(b.address));
  },
};

function createConfiguredMailbox(address: string): Mailbox {
  return {
    address,
    type: "address",
    status: "active",
    messageCount: 0,
  };
}

async function scanMailboxItems(
  tableName: string
): Promise<Record<string, unknown>[]> {
  try {
    const result = await ddb.send(
      new ScanCommand({
        TableName: tableName,
      })
    );

    return (result.Items ?? []) as Record<string, unknown>[];
  } catch (error) {
    if (!isAccessDeniedError(error)) {
      throw error;
    }

    console.warn(
      "Falling back to configured mailboxes because Scan on AWS_MAILBOXES_TABLE was denied."
    );

    return [];
  }
}

function toMailbox(item: Record<string, unknown>): Mailbox | null {
  const address = readString(item.address) ?? addressFromLegacyFields(item);
  if (!address) return null;

  return {
    address,
    type: readString(item.type) === "agent" ? "agent" : "address",
    status: readString(item.status) === "disabled" ? "disabled" : "active",
    messageCount: readNumber(item.message_count) ?? 0,
  };
}

function addressFromLegacyFields(item: Record<string, unknown>): string | null {
  if (typeof item.email === "string") return item.email;
  if (typeof item.mailbox_address === "string") return item.mailbox_address;
  if (typeof item.inbox_id === "string") {
    const inboxId = item.inbox_id.trim();
    if (!inboxId) return null;

    const configuredMatch = appConfig.inboundAddresses.find(
      (address) =>
        address === inboxId ||
        address.startsWith(`${inboxId}@`) ||
        address.endsWith(`@${inboxId}`)
    );

    return configuredMatch ?? inboxId;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    candidate.message.includes("not authorized to perform: dynamodb:Scan")
  );
}

async function countMessagesForMailbox(mailboxAddress: string): Promise<number> {
  const tableName = requireAwsValue(
    appConfig.aws.messagesTable,
    "AWS_MESSAGES_TABLE"
  );
  const access = await getMessageTableAccess();

  for (const candidate of mailboxCandidates(
    mailboxAddress,
    access.listMessages.hashKey
  )) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        ...(access.listMessages.kind === "index" && {
          IndexName: access.listMessages.indexName,
        }),
        KeyConditionExpression: `${access.listMessages.hashKey} = :mailbox`,
        ExpressionAttributeValues: {
          ":mailbox": candidate,
        },
        Select: "COUNT",
      })
    );

    if ((result.Count ?? 0) > 0) {
      return result.Count ?? 0;
    }
  }

  return 0;
}
