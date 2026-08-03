import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAllMessages, listMailboxes } from "@/lib/mail-service";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const mailboxes = await listMailboxes();
  const messages = await listAllMessages(mailboxes, 100);

  return NextResponse.json({
    messages: messages.map((message) => ({
      message_id: message.messageId,
      mailbox_address: message.mailboxAddress,
      direction: message.direction ?? null,
      from: message.from,
      to: message.to,
      subject: message.subject,
      date: message.date,
      size: message.size,
      reply_to: message.replyTo,
      label: message.label ?? null,
      body_preview: message.bodyPreview,
      attachment_count: message.attachmentCount,
      read_at: message.readAt,
      unread: message.unread,
      starred: message.starred,
      archived: message.archived,
    })),
  });
}
