import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const { jobId } = await context.params;
    const candidates = await db.ingestDiscoveryCandidate.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_discovery_jobId_candidates_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
