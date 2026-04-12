import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ hostname: z.string().min(3) });

export async function GET(_req: NextRequest, context: { params: Promise<{ hostname: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid hostname");

    const profile = await db.siteProfile.findUnique({
      where: { hostname: parsedParams.data.hostname },
      select: {
        id: true,
        hostname: true,
        platform: true,
        confidence: true,
        lastProfiledAt: true,
        paths: {
          orderBy: { contentType: "asc" },
          select: {
            id: true,
            name: true,
            baseUrl: true,
            contentType: true,
            indexPattern: true,
            linkPattern: true,
            paginationType: true,
            enabled: true,
            crawlDepth: true,
            crawlIntervalMinutes: true,
            lastRunAt: true,
            lastRunFound: true,
            lastRunError: true,
          },
        },
      },
    });

    if (!profile) return apiError(404, "not_found", "Site profile not found");
    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
