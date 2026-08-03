import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateMessageState } from "@/lib/mail-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json()) as {
    mailbox?: unknown;
    read?: unknown;
    starred?: unknown;
    archived?: unknown;
  };

  if (typeof body.mailbox !== "string" || !body.mailbox.trim()) {
    return NextResponse.json({ error: "mailbox required" }, { status: 400 });
  }

  const state = await updateMessageState(id, {
    mailboxAddress: body.mailbox,
    ...(typeof body.read === "boolean" && { read: body.read }),
    ...(typeof body.starred === "boolean" && { starred: body.starred }),
    ...(typeof body.archived === "boolean" && { archived: body.archived }),
  });

  return NextResponse.json({
    message_id: id,
    mailbox_address: body.mailbox,
    read_at: state.readAt,
    unread: state.unread,
    starred: state.starred,
    archived: state.archived,
  });
}
