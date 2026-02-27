import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireVenueRole, isAuthError } from "@/lib/auth";
import { myVenuePatchSchema, parseBody, venueIdParamSchema, zodDetails } from "@/lib/validators";
import { submissionSubmittedDedupeKey } from "@/lib/notification-keys";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { MapboxForwardGeocodeError } from "@/lib/geocode/mapbox-forward";
import { geocodeForVenueUpdate } from "@/lib/venues/venue-geocode-flow";
import { inferTimezoneFromLatLng, isValidIanaTimezone } from "@/lib/timezone";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsedId = venueIdParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const parsedBody = myVenuePatchSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const user = await requireVenueRole(parsedId.data.id, "EDITOR");

    const existing = await db.venue.findUnique({
      where: { id: parsedId.data.id },
      select: {
        id: true,
        isPublished: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        region: true,
        postcode: true,
        country: true,
        lat: true,
        lng: true,
      },
    });
    if (!existing) return apiError(404, "not_found", "Venue not found");

    const { submitForApproval, note, featuredAssetId, autoDetectTimezone, ...safeFields } = parsedBody.data;

    if (featuredAssetId) {
      const asset = await db.asset.findUnique({ where: { id: featuredAssetId }, select: { ownerUserId: true } });
      if (!asset || asset.ownerUserId !== user.id) return apiError(403, "forbidden", "Can only use your own uploaded assets");
    }

    const updateData: Record<string, unknown> = { ...safeFields, featuredAssetId: featuredAssetId ?? null };

    if (typeof safeFields.timezone === "string" && safeFields.timezone.trim() && !isValidIanaTimezone(safeFields.timezone)) {
      return apiError(400, "invalid_request", "Timezone must be a valid IANA timezone");
    }

    if (autoDetectTimezone) {
      const lat = safeFields.lat ?? existing.lat;
      const lng = safeFields.lng ?? existing.lng;
      if (lat == null || lng == null) return apiError(409, "invalid_state", "Latitude and longitude are required to infer timezone");
      updateData.timezone = inferTimezoneFromLatLng(lat, lng);
    }

    try {
      const result = await geocodeForVenueUpdate({ existing, patch: safeFields });
      if (result) {
        updateData.lat = result.lat;
        updateData.lng = result.lng;
      }
    } catch (error) {
      if (!(error instanceof MapboxForwardGeocodeError && ["not_configured", "provider_error", "provider_timeout"].includes(error.code))) {
        console.warn(`my_venue_update_geocode_failed venueId=${existing.id} city=${safeFields.city ?? existing.city ?? ""} postcode=${safeFields.postcode ?? existing.postcode ?? ""}`);
      }
    }

    const venue = await db.venue.update({ where: { id: existing.id }, data: updateData });

    if (submitForApproval && !existing.isPublished && user.role === "USER") {
      const latest = await db.submission.findFirst({
        where: { targetVenueId: existing.id, type: "VENUE", kind: "PUBLISH" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { status: true },
      });

      if (latest?.status === "SUBMITTED") {
        return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission is already pending review." }, { status: 409 });
      }

      const submission = await db.submission.create({
        data: {
          type: "VENUE",
          kind: "PUBLISH",
          status: "SUBMITTED",
          submitterUserId: user.id,
          venueId: existing.id,
          targetVenueId: existing.id,
          note: note ?? null,
          decisionReason: null,
          submittedAt: new Date(),
          decidedAt: null,
          decidedByUserId: null,
        },
      });

      await enqueueNotification({
        type: "SUBMISSION_SUBMITTED",
        toEmail: user.email,
        dedupeKey: submissionSubmittedDedupeKey(submission.id),
        payload: {
          submissionId: submission.id,
          status: submission.status,
          submittedAt: submission.submittedAt?.toISOString() ?? null,
        },
        inApp: buildInAppFromTemplate(user.id, "SUBMISSION_SUBMITTED", {
          type: "SUBMISSION_SUBMITTED",
          submissionId: submission.id,
          submissionType: "VENUE",
          targetVenueId: existing.id,
        }),
      });
    }

      await setOnboardingFlagForSession(user, "hasCreatedVenue", true, { path: "/api/my/venues/[id]" });

    return NextResponse.json(venue, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Venue membership required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
