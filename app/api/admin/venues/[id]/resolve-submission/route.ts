import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { id } = await params;
    const body = await req.json() as { decision?: string };
    const decision = body.decision === "APPROVED" ? "APPROVED" : "REJECTED";

    await db.submission.updateMany({
      where: {
        targetVenueId: id,
        status: "IN_REVIEW",
      },
      data: {
        status: decision,
        decidedAt: new Date(),
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    console.error("admin_venues_id_resolve_submission_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
