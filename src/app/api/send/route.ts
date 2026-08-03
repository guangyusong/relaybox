import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendMessage } from "@/lib/mail-service";

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { from, to, cc, subject, body, replyToMessageId } = await req.json();

  if (!from || !to || !subject || !body) {
    return NextResponse.json(
      { error: "from, to, subject, and body are required" },
      { status: 400 }
    );
  }

  const toList = Array.isArray(to)
    ? to
    : to
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);
  const ccList = cc
    ? Array.isArray(cc)
      ? cc
      : cc
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean)
    : [];

  try {
    const result = await sendMessage({
      from,
      to: toList,
      cc: ccList,
      subject,
      body,
      replyToMessageId,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to send", detail: message },
      { status: 500 }
    );
  }
}
