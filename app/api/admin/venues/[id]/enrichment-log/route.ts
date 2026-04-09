import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;

    const logs = await db.venueEnrichmentLog.findMany({
      where: { venueId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        changedFields: true,
        before: true,
        after: true,
        runId: true,
      },
    });

    return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_venues_id_enrichment_log_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
