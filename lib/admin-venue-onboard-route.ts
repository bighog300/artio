import { AdminAccessError, requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { IngestError } from "@/lib/ingest/errors";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { computeVenuePublishBlockers } from "@/lib/publish-readiness";
import { idParamSchema } from "@/lib/validators";

type AdminVenueOnboardDeps = {
  appDb: Pick<typeof db, "venue" | "ingestRun">;
  requireAdminFn: typeof requireAdmin;
  logAction: typeof logAdminAction;
};

const defaultDeps: AdminVenueOnboardDeps = {
  appDb: db,
  requireAdminFn: requireAdmin,
  logAction: logAdminAction,
};

export async function handleAdminVenueOnboard(
  req: Request,
  params: { id?: string },
  deps: Partial<AdminVenueOnboardDeps> = {},
) {
  const resolved = { ...defaultDeps, ...deps };
  try {
    const admin = await resolved.requireAdminFn({ redirectOnFail: false });

    const parsedId = idParamSchema.safeParse({ id: params.id });
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const body = await req.json().catch(() => ({})) as { eventsPageUrl?: string | null };
    const venue = await resolved.appDb.venue.findUnique({
      where: { id: parsedId.data.id },
      select: {
        id: true,
        status: true,
        featuredAssetId: true,
        websiteUrl: true,
        eventsPageUrl: true,
        country: true,
        lat: true,
        lng: true,
        name: true,
        city: true,
      },
    });

    if (!venue) return apiError(404, "not_found", "Venue not found");
    if (venue.status !== "ONBOARDING") return apiError(409, "not_in_onboarding", "Venue is not in ONBOARDING status");

    const blockers = computeVenuePublishBlockers(venue);
    if (blockers.length > 0) {
      return apiError(422, "publish_blocked", "Venue cannot be published", blockers);
    }

    let requestEventsPageUrl: string | null | undefined = undefined;
    if (typeof body.eventsPageUrl === "string") {
      const safe = await assertSafeUrl(body.eventsPageUrl);
      requestEventsPageUrl = safe.toString();
      await resolved.appDb.venue.update({
        where: { id: venue.id },
        data: { eventsPageUrl: requestEventsPageUrl },
      });
    }

    await resolved.appDb.venue.update({
      where: { id: venue.id },
      data: { status: "PUBLISHED", isPublished: true },
    });

    const sourceUrl = requestEventsPageUrl ?? venue.eventsPageUrl ?? venue.websiteUrl;
    let ingestRunCreated = false;
    if (sourceUrl) {
      await resolved.appDb.ingestRun.create({
        data: {
          venueId: venue.id,
          sourceUrl,
          status: "PENDING",
        },
      });
      ingestRunCreated = true;
    }

    await resolved.logAction({
      actorEmail: admin.email,
      action: "admin.venue.onboard",
      targetType: "venue",
      targetId: venue.id,
      req,
      metadata: { ingestRunCreated, sourceUrl: sourceUrl ?? null },
    });

    return Response.json({ published: true, venueId: venue.id, ingestRunCreated });
  } catch (error) {
    if (error instanceof AdminAccessError) return apiError(401, "unauthorized", "Unauthorized");
    if (error instanceof IngestError) {
      return apiError(422, "invalid_events_page_url", "Invalid events page URL");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
