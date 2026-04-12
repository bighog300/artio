import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ hostname: z.string(), pathId: z.string().uuid() });
const patchSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
  indexPattern: z.string().nullable().optional(),
  linkPattern: z.string().nullable().optional(),
  crawlIntervalMinutes: z.number().int().min(60).max(525600).optional(),
  crawlDepth: z.number().int().min(1).max(5).optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ hostname: string; pathId: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid params");

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload");

    const updated = await db.ingestionPath.update({
      where: { id: parsedParams.data.pathId },
      data: {
        ...parsed.data,
        updatedAt: new Date(),
      },
      select: { id: true, enabled: true, name: true },
    });

    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
