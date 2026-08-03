import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listMessages } from "@/lib/mail-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { address } = await params;
  const target = decodeURIComponent(address).toLowerCase();
  const messages = await listMessages(target);

  return NextResponse.json({
    messages: messages.map((message) => ({
      message_id: message.messageId,
      direction: message.direction ?? null,
      from: message.from,
      to: message.to,
      subject: message.subject,
      date: message.date,
      size: message.size,
      reply_to: message.replyTo,
      label: message.label ?? null,
    })),
  });
}
