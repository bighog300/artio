import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;
    const row = await db.ingestRegion.findUnique({ where: { id } });
    if (!row) return apiError(404, "not_found", "Region not found");
    return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;
    const row = await db.ingestRegion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) return apiError(404, "not_found", "Region not found");

    await db.ingestRegion.update({
      where: { id },
      data: { status: "PAUSED" },
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
