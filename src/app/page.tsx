import { InboxWorkspace } from "@/components/inbox-workspace";
import { requirePageAuth } from "@/lib/auth";
import {
  getMessage,
  listAllMessages,
  listMailboxes,
  withMailboxUnreadCounts,
} from "@/lib/mail-service";
import type { MessageSummary } from "@/lib/mail-types";

export default async function DashboardPage() {
  await requirePageAuth();

  let mailboxes = await listMailboxes();
  let messages = await listAllMessages(mailboxes, 100);
  const firstMessage = messages[0];
  const initialMessage = firstMessage
    ? await getMessage(firstMessage.messageId, firstMessage.mailboxAddress, {
        markRead: true,
      })
    : null;
  if (initialMessage) {
    messages = syncMessageState(messages, initialMessage);
  }
  mailboxes = withMailboxUnreadCounts(mailboxes, messages);
  const totalMessages = mailboxes.reduce(
    (sum, mailbox) => sum + mailbox.messageCount,
    0
  );

  return (
    <InboxWorkspace
      initialMessage={initialMessage}
      mailboxes={mailboxes}
      messages={messages}
      totalMessages={totalMessages}
    />
  );
}

function syncMessageState(
  messages: MessageSummary[],
  detail: MessageSummary
): MessageSummary[] {
  return messages.map((message) =>
    message.messageId === detail.messageId &&
    message.mailboxAddress === detail.mailboxAddress
      ? {
          ...message,
          readAt: detail.readAt,
          unread: detail.unread,
          starred: detail.starred,
          archived: detail.archived,
        }
      : message
  );
}
