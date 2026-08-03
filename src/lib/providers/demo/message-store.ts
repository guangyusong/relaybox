import type { MessageStore } from "@/lib/providers/types";
import { getLabels, setLabel } from "@/lib/labels";
import { demoMessages } from "@/lib/providers/demo/fixtures";

export const demoMessageStore: MessageStore = {
  async listMessages(mailboxAddress) {
    const labels = await getLabels();

    return demoMessages
      .filter((message) => message.mailboxAddress === mailboxAddress)
      .map((message) => ({
        messageId: message.messageId,
        mailboxAddress: message.mailboxAddress,
        direction: message.direction,
        from: message.from,
        to: message.to,
        subject: message.subject,
        date: message.date,
        size: message.size,
        replyTo: message.replyTo,
        label: labels[message.messageId],
        bodyPreview: previewText(message.text),
        attachmentCount: message.attachments.length,
        readAt: null,
        unread: false,
        starred: false,
        archived: false,
      }))
      .sort(sortByDateDesc);
  },

  async getMessage(messageId) {
    const labels = await getLabels();
    const message = demoMessages.find((item) => item.messageId === messageId);
    if (!message) return null;

    return {
      ...message,
      label: labels[message.messageId],
      bodyPreview: previewText(message.text),
      attachmentCount: message.attachments.length,
      readAt: null,
      unread: false,
      starred: false,
      archived: false,
    };
  },

  getLabels,
  setLabel,
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

function previewText(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 180);
}
