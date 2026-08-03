import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function GET() {
  const authed = await verifySession();
  return NextResponse.json({ authenticated: authed });
}
