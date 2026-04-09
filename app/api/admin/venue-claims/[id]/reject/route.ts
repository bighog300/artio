import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { rejectClaim } from "@/lib/venue-claims/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const rejectionReason = reason.length > 0 ? reason : null;

    const claim = await db.venueClaimRequest.findUnique({ where: { id }, select: { id: true, userId: true, venueId: true } });
    if (!claim) return apiError(404, "not_found", "Claim not found");

    await rejectClaim(db as never, id, rejectionReason, new Date());

    if (claim.userId) {
      const user = await db.user.findUnique({ where: { id: claim.userId }, select: { email: true } });
      const venue = await db.venue.findUnique({ where: { id: claim.venueId }, select: { slug: true, name: true } });
      if (user?.email && venue) {
        await enqueueNotification({
          type: "VENUE_CLAIM_REJECTED",
          toEmail: user.email,
          dedupeKey: `venue-claim-rejected-${claim.id}`,
          payload: { type: "VENUE_CLAIM_REJECTED", venueSlug: venue.slug, venueName: venue.name, reason: rejectionReason },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    console.error("admin_venue_claims_id_reject_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
