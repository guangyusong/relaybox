import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { authProvider } from "@/lib/providers";

export async function createSession(): Promise<void> {
  await authProvider.createSession();
}

export async function verifySession(): Promise<boolean> {
  return authProvider.verifySession();
}

export async function destroySession(): Promise<void> {
  await authProvider.destroySession();
}

export function verifyAdminPassword(input: string): boolean {
  return authProvider.verifyPassword(input);
}

export async function requireAuth(): Promise<NextResponse | null> {
  const authed = await verifySession();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function requirePageAuth(): Promise<void> {
  const authed = await verifySession();
  if (!authed) {
    redirect("/login");
  }
}
