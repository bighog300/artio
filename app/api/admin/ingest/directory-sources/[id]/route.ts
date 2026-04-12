import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const patchSchema = z.object({
  isActive: z.boolean().optional(),
  crawlIntervalMinutes: z.number().int().min(60).max(525600).optional(),
  maxPagesPerLetter: z.number().int().min(1).max(50).optional(),
  linkPattern: z.string().trim().max(500).nullable().optional(),
  pipelineMode: z.enum(["manual", "auto_discover", "auto_full"]).optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const updateData: z.infer<typeof patchSchema> = {};
    if (typeof parsed.data.isActive === "boolean") updateData.isActive = parsed.data.isActive;
    if (typeof parsed.data.crawlIntervalMinutes === "number") updateData.crawlIntervalMinutes = parsed.data.crawlIntervalMinutes;
    if (typeof parsed.data.maxPagesPerLetter === "number") updateData.maxPagesPerLetter = parsed.data.maxPagesPerLetter;
    if (parsed.data.linkPattern !== undefined) updateData.linkPattern = parsed.data.linkPattern;
    if (parsed.data.pipelineMode !== undefined) updateData.pipelineMode = parsed.data.pipelineMode;

    const existing = await db.directorySource.findUnique({ where: { id: parsedParams.data.id }, select: { id: true } });
    if (!existing) return apiError(404, "not_found", "Directory source not found");

    const row = await db.directorySource.update({
      where: { id: parsedParams.data.id },
      data: updateData,
    });

    return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const existing = await db.directorySource.findUnique({ where: { id: parsedParams.data.id }, select: { id: true } });
    if (!existing) return apiError(404, "not_found", "Directory source not found");

    await db.directorySource.delete({ where: { id: parsedParams.data.id } });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
