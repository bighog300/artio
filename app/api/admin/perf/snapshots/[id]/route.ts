import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { guardAdmin } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const adminGuard = await guardAdmin();
  if (adminGuard instanceof NextResponse) return adminGuard;

  try {
    const params = await context.params;
    const parsed = idParamSchema.safeParse(params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid id", zodDetails(parsed.error));

    const snapshot = await db.perfSnapshot.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, name: true, createdAt: true, createdByUserId: true, paramsJson: true, explainText: true, durationMs: true },
    });

    if (!snapshot) return apiError(404, "not_found", "Snapshot not found");
    return NextResponse.json(snapshot);
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}


export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const adminGuard = await guardAdmin();
  if (adminGuard instanceof NextResponse) return adminGuard;

  try {
    const params = await context.params;
    const parsed = idParamSchema.safeParse(params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid id", zodDetails(parsed.error));

    const existing = await db.perfSnapshot.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });

    if (!existing) return apiError(404, "not_found", "Snapshot not found");

    await db.perfSnapshot.delete({ where: { id: parsed.data.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
