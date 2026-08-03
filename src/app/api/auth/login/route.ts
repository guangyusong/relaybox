import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
