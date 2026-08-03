import "server-only";

import {
  hydrateMessageStates,
  setMessageReadState,
  updateMessageState as updateStoredMessageState,
} from "@/lib/mail-state";
import type {
  Mailbox,
  MessageDetail,
  MessageStateUpdate,
  MessageSummary,
} from "@/lib/mail-types";
import { inboundProvider, messageStore, outboundProvider } from "@/lib/providers";

export async function listMailboxes(): Promise<Mailbox[]> {
  const mailboxes = await inboundProvider.listMailboxes();

  return [...mailboxes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "address" ? -1 : 1;
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return a.address.localeCompare(b.address);
  });
}

export async function listMessages(
  mailboxAddress: string
): Promise<MessageSummary[]> {
  const messages = await messageStore.listMessages(mailboxAddress);
  return hydrateMessageStates(messages);
}

export async function listAllMessages(
  mailboxes: Mailbox[],
  limit = 100
): Promise<MessageSummary[]> {
  const batches = await Promise.all(
    mailboxes.map((mailbox) => messageStore.listMessages(mailbox.address))
  );

  const messages = await hydrateMessageStates(batches.flat());

  return messages
    .sort((left, right) => {
      if (!left.date && !right.date) return 0;
      if (!left.date) return 1;
      if (!right.date) return -1;
      return new Date(right.date).getTime() - new Date(left.date).getTime();
    })
    .slice(0, limit);
}

export async function getMessage(
  messageId: string,
  mailboxAddress?: string,
  options?: { markRead?: boolean }
): Promise<MessageDetail | null> {
  const message = await messageStore.getMessage(messageId, mailboxAddress);
  if (!message) return null;

  if (options?.markRead) {
    await setMessageReadState(message.messageId, message.mailboxAddress, true);
  }

  const [hydrated] = await hydrateMessageStates([message]);
  return hydrated;
}

export async function listLabels() {
  return messageStore.getLabels();
}

export async function setLabel(messageId: string, label: string) {
  return messageStore.setLabel(messageId, label);
}

export async function updateMessageState(
  messageId: string,
  input: MessageStateUpdate
) {
  return updateStoredMessageState(messageId, input.mailboxAddress, {
    read: input.read,
    starred: input.starred,
    archived: input.archived,
  });
}

export function withMailboxUnreadCounts(
  mailboxes: Mailbox[],
  messages: MessageSummary[]
): Mailbox[] {
  const unreadByMailbox = new Map<string, number>();

  for (const message of messages) {
    if (!message.unread || message.archived) continue;

    unreadByMailbox.set(
      message.mailboxAddress,
      (unreadByMailbox.get(message.mailboxAddress) ?? 0) + 1
    );
  }

  return mailboxes.map((mailbox) => ({
    ...mailbox,
    unreadCount: unreadByMailbox.get(mailbox.address) ?? 0,
  }));
}

export async function listSenderIdentities(): Promise<string[]> {
  return outboundProvider.listSenderIdentities();
}

export async function sendMessage(input: {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}) {
  return outboundProvider.sendMessage(input);
}
