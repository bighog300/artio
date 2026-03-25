import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { approveClaim } from "@/lib/venue-claims/service";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { id } = await params;
    const claimRecord = await db.venueClaimRequest.findUnique({ where: { id }, select: { id: true, userId: true, venueId: true } });
    if (!claimRecord) return apiError(404, "not_found", "Claim not found");

    const claim = await approveClaim(db as never, id, new Date());
    if (!claim) return apiError(404, "not_found", "Claim not found");

    if (claimRecord.userId) {
      const user = await db.user.findUnique({ where: { id: claimRecord.userId }, select: { email: true } });
      const venue = await db.venue.findUnique({ where: { id: claimRecord.venueId }, select: { slug: true, name: true } });
      if (user?.email && venue) {
        await enqueueNotification({
          type: "VENUE_CLAIM_APPROVED",
          toEmail: user.email,
          dedupeKey: `venue-claim-approved-${claimRecord.id}`,
          payload: { type: "VENUE_CLAIM_APPROVED", venueSlug: venue.slug, venueName: venue.name },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
