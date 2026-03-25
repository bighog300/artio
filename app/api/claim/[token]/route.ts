import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { submitVenueClaimFromInvite } from "@/lib/venue-claims/service";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireUser();
    const { token } = await params;
    const submitted = await submitVenueClaimFromInvite({ db: db as never, token, userId: user.id });

    const adminRecipients = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
    const venue = await db.venue.findUnique({ where: { id: submitted.venueId }, select: { slug: true } });

    if (venue?.slug) {
      await db.notificationOutbox.createMany({
        data: adminRecipients.map((recipient) => ({
          type: "SUBMISSION_SUBMITTED",
          toEmail: recipient.email,
          dedupeKey: `venue-claim-submitted:${submitted.claimId}:${recipient.id}`,
          payload: {
            type: "SUBMISSION_SUBMITTED",
            submissionId: submitted.claimId,
            submissionType: "VENUE",
            targetVenueId: submitted.venueId,
          },
        })),
        skipDuplicates: true,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && ["invalid", "expired", "claimed"].includes(error.message)) {
      return apiError(409, "invalid_invite", "Invite is no longer valid");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
