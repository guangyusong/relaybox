import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  listAllMessages,
  listMailboxes,
  withMailboxUnreadCounts,
} from "@/lib/mail-service";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const baseMailboxes = await listMailboxes();
  const messages = await listAllMessages(baseMailboxes, Number.POSITIVE_INFINITY);
  const mailboxes = withMailboxUnreadCounts(baseMailboxes, messages);
  return NextResponse.json({
    mailboxes: mailboxes.map((mailbox) => ({
      address: mailbox.address,
      type: mailbox.type,
      status: mailbox.status,
      message_count: mailbox.messageCount,
      unread_count: mailbox.unreadCount ?? 0,
    })),
  });
}
