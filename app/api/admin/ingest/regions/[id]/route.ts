import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
    console.error("admin_ingest_regions_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
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
    console.error("admin_ingest_regions_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

const patchSchema = z.object({
  artistDiscoveryEnabled: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success)
      return apiError(400, "bad_request", "Invalid request body");

    const existing = await db.ingestRegion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return apiError(404, "not_found", "Region not found");

    const row = await db.ingestRegion.update({
      where: { id },
      data: { artistDiscoveryEnabled: parsed.data.artistDiscoveryEnabled },
    });

    return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_regions_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
