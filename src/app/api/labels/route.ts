import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listLabels, setLabel } from "@/lib/mail-service";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return NextResponse.json(await listLabels());
}

export async function PUT(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id, label } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const labels = await setLabel(id, label ?? "");
  return NextResponse.json(labels);
}
