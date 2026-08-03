import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMessage } from "@/lib/mail-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const mailboxAddress = req.nextUrl.searchParams.get("mailbox") ?? undefined;
  const message = await getMessage(id, mailboxAddress, { markRead: true });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  return NextResponse.json({
    message_id: message.messageId,
    mailbox_address: message.mailboxAddress,
    direction: message.direction ?? null,
    from: message.from,
    to: message.to,
    subject: message.subject,
    date: message.date,
    size: message.size,
    body_preview: message.bodyPreview,
    attachment_count: message.attachmentCount,
    read_at: message.readAt,
    unread: message.unread,
    starred: message.starred,
    archived: message.archived,
    text: message.text,
    html: message.html,
    label: message.label ?? null,
    headers: {
      reply_to: message.headers.replyTo,
      message_id: message.headers.messageId,
    },
    attachments: message.attachments,
    ses: message.ses,
  });
}
