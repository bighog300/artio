import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { canSelfPublish, type SessionUser } from "@/lib/auth";
import type { AdminAuditInput } from "@/lib/admin-audit";
import { evaluateVenueReadiness } from "@/lib/publish-readiness";

type VenueRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  featuredAssetId: string | null;
  city: string | null;
  country: string | null;
  lat?: number | null;
  lng?: number | null;
  websiteUrl: string | null;
  deletedAt: Date | null;
  isPublished: boolean;
  status?: string | null;
};

type Deps = {
  requireVenueRole: (venueId: string) => Promise<SessionUser>;
  findVenueForPublish: (venueId: string) => Promise<VenueRecord | null>;
  updateVenuePublishState: (venueId: string, isPublished: boolean) => Promise<VenueRecord>;
  logAdminAction: (input: AdminAuditInput) => Promise<void>;
};

export async function handleVenueSelfPublish(req: NextRequest, input: { venueId: string; isPublished: boolean }, deps: Deps) {
  try {
    const user = await deps.requireVenueRole(input.venueId);
    if (input.isPublished && !canSelfPublish(user)) return apiError(403, "forbidden", "Direct publishing not permitted");

    const venue = await deps.findVenueForPublish(input.venueId);
    if (!venue) return apiError(404, "not_found", "Venue not found");
    if (venue.deletedAt) return apiError(409, "invalid_state", "Archived venues cannot be directly published");

    if (input.isPublished) {
      const readiness = evaluateVenueReadiness(venue);
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error: "publish_blocked",
            blockers: readiness.blocking.map((blocker) => ({ id: blocker.id, message: blocker.label })),
          },
          { status: 409 },
        );
      }
    }

    const updated = await deps.updateVenuePublishState(input.venueId, input.isPublished);
    await deps.logAdminAction({
      actorEmail: user.email,
      action: "VENUE_SELF_PUBLISH_TOGGLED",
      targetType: "venue",
      targetId: updated.id,
      metadata: { isPublished: updated.isPublished },
      req,
    });

    return NextResponse.json({ venue: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue editor role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
