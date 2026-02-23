import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { handlePostMyVenue, VenueLimitReachedError } from "@/lib/my-venue-create-route";
import { logAdminAction } from "@/lib/admin-audit";
import { geocodeBest } from "@/lib/geocode";

export const runtime = "nodejs";

function buildVenueGeocodeQuery(fields: {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
}) {
  const parts = [fields.name, fields.addressLine1, fields.addressLine2, fields.city, fields.postcode, fields.country]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.length > 0 ? parts.join(", ") : null;
}

function isNotConfiguredError(error: unknown) {
  if (typeof error === "string") return error === "not_configured";
  if (error && typeof error === "object") {
    const withMessage = error as { message?: unknown; code?: unknown };
    return withMessage.message === "not_configured" || withMessage.code === "not_configured";
  }
  return false;
}

export async function GET() {
  try {
    const user = await requireAuth();
    const items = await db.venueMembership.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            region: true,
            country: true,
            postcode: true,
            lat: true,
            lng: true,
            websiteUrl: true,
            instagramUrl: true,
            contactEmail: true,
            featuredImageUrl: true,
            featuredAssetId: true,
            isPublished: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(items.map((item) => ({ membershipRole: item.role, venue: item.venue })));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  return handlePostMyVenue(req, {
    requireAuth,
    findExistingManagedVenue: async ({ userId, createKey }) => {
      const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const memberships = await db.venueMembership.findMany({
        where: { userId, role: "OWNER" },
        orderBy: { createdAt: "desc" },
        select: { venue: { select: { id: true, slug: true, name: true, city: true, country: true, isPublished: true } } },
      });

      const matched = memberships.find(({ venue }) => [
        normalize(venue.name),
        normalize(venue.city),
        normalize(venue.country),
      ].join("|") === createKey);

      if (matched) return { id: matched.venue.id, slug: matched.venue.slug, name: matched.venue.name, isPublished: matched.venue.isPublished };

      const fallback = memberships[0]?.venue;
      return fallback ? { id: fallback.id, slug: fallback.slug, name: fallback.name, isPublished: fallback.isPublished } : null;
    },
    findVenueBySlug: async (slug) => db.venue.findUnique({ where: { slug }, select: { id: true } }),
    assertCanCreateVenue: async (user) => {
      if (user.role === "USER") throw new Error("forbidden");

      const ownedVenueCount = await db.venueMembership.count({
        where: { userId: user.id, role: "OWNER", venue: { is: {} } },
      });
      if (ownedVenueCount >= 3) throw new VenueLimitReachedError(3);
    },
    createVenue: async (data) => {
      let effectiveLat = data.lat;
      let effectiveLng = data.lng;

      const hasManualLat = data.lat != null;
      const hasManualLng = data.lng != null;
      const shouldGeocode = !hasManualLat && !hasManualLng
        && Boolean(data.postcode || data.city || data.addressLine1);

      if (shouldGeocode) {
        const query = buildVenueGeocodeQuery({
          name: data.name,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          postcode: data.postcode,
          country: data.country,
        });

        if (query) {
          try {
            const result = await geocodeBest(query);
            if (result) {
              effectiveLat = result.lat;
              effectiveLng = result.lng;
            }
          } catch (error) {
            if (!isNotConfiguredError(error)) {
              console.warn(`my_venue_geocode_failed venueId=pending city=${data.city ?? ""} postcode=${data.postcode ?? ""}`);
            }
          }
        }
      }

      return db.venue.create({
        data: {
          name: data.name,
          slug: data.slug,
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          postcode: data.postcode ?? null,
          lat: effectiveLat ?? null,
          lng: effectiveLng ?? null,
          websiteUrl: data.websiteUrl ?? null,
          instagramUrl: data.instagramUrl ?? null,
          featuredAssetId: null,
          isPublished: false,
        },
        select: { id: true, slug: true, name: true, isPublished: true },
      });
    },
    ensureOwnerMembership: async (venueId, userId) => {
      await db.venueMembership.upsert({
        where: { userId_venueId: { userId, venueId } },
        create: { userId, venueId, role: "OWNER" },
        update: { role: "OWNER" },
      });
    },
    upsertVenueDraftSubmission: async (venueId, userId) => {
      const latest = await db.submission.findFirst({ where: { targetVenueId: venueId, type: "VENUE", kind: "PUBLISH" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true } });
      if (latest?.status === "DRAFT") {
        await db.submission.update({ where: { id: latest.id }, data: { submitterUserId: userId } });
        return;
      }
      if (latest?.status === "SUBMITTED") return;

      await db.submission.create({
        data: {
          type: "VENUE",
          kind: "PUBLISH",
          status: "DRAFT",
          submitterUserId: userId,
          venueId,
          targetVenueId: venueId,
        },
      });
    },
    setOnboardingFlag: async (user) => {
      await setOnboardingFlagForSession(user, "hasCreatedVenue", true, { path: "/api/my/venues" });
    },
    logAudit: async ({ action, user, venue, reused, createKey, req: request }) => {
      await logAdminAction({
        actorEmail: user.email ?? "unknown@local",
        action,
        targetType: "venue",
        targetId: venue.id,
        metadata: { userId: user.id, venueId: venue.id, slug: venue.slug, reused, createKey },
        req: request,
      });
    },
  });
}
