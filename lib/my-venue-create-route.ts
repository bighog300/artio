import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { VenueSlugExhaustedError, ensureUniqueVenueSlugWithDeps, slugifyVenueName } from "@/lib/venue-slug";
import { myVenueCreateSchema, parseBody, zodDetails } from "@/lib/validators";

type SessionUser = {
  id: string;
  email?: string | null;
  role?: "USER" | "EDITOR" | "ADMIN";
};

export class VenueLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super("venue_limit_reached");
  }
}

type VenueRecord = {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  findExistingManagedVenue: (params: { userId: string; createKey: string }) => Promise<VenueRecord | null>;
  findVenueBySlug: (slug: string) => Promise<{ id: string } | null>;
  assertCanCreateVenue: (user: SessionUser) => Promise<void>;
  createVenue: (data: {
    name: string;
    slug: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    postcode?: string | null;
    lat?: number | null;
    lng?: number | null;
    websiteUrl?: string | null;
    instagramUrl?: string | null;
  }) => Promise<VenueRecord>;
  ensureOwnerMembership: (venueId: string, userId: string) => Promise<void>;
  upsertVenueDraftSubmission: (venueId: string, userId: string) => Promise<void>;
  setOnboardingFlag: (user: SessionUser) => Promise<void>;
  logAudit: (args: { action: string; user: SessionUser; venue: VenueRecord; reused: boolean; createKey: string; req: NextRequest }) => Promise<void>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function normalizeKeyPart(input?: string | null) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCreateKey(input: { name: string; city?: string | null; country?: string | null }) {
  return [normalizeKeyPart(input.name), normalizeKeyPart(input.city), normalizeKeyPart(input.country)].join("|");
}

function normalizeOptionalText(input?: string | null) {
  const trimmed = input?.trim();
  return trimmed ? trimmed : undefined;
}

export async function handlePostMyVenue(req: NextRequest, deps: Deps) {
  let user: SessionUser;
  try {
    user = await deps.requireAuth();
  } catch {
    return apiError(401, "unauthorized", "Authentication required");
  }

  try {
    const parsedBody = myVenueCreateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const createKey = buildCreateKey(parsedBody.data);
    const existing = await deps.findExistingManagedVenue({ userId: user.id, createKey });

    if (existing) {
      await deps.ensureOwnerMembership(existing.id, user.id);
      await deps.upsertVenueDraftSubmission(existing.id, user.id);
      await deps.setOnboardingFlag(user);
      await deps.logAudit({ action: "VENUE_CREATED_SELF_SERVE", user, venue: existing, reused: true, createKey, req });
      return NextResponse.json({ venue: existing, created: false }, { headers: NO_STORE_HEADERS });
    }

    const slugBase = slugifyVenueName(parsedBody.data.name);
    await deps.assertCanCreateVenue(user);

    const slug = await ensureUniqueVenueSlugWithDeps(
      { findBySlug: deps.findVenueBySlug },
      slugBase,
      25,
    );
    if (!slug) return apiError(400, "invalid_request", "Name cannot be converted to a valid slug");

    const venue = await deps.createVenue({
      name: parsedBody.data.name,
      slug,
      addressLine1: normalizeOptionalText(parsedBody.data.addressLine1),
      addressLine2: normalizeOptionalText(parsedBody.data.addressLine2),
      city: normalizeOptionalText(parsedBody.data.city ?? undefined),
      region: normalizeOptionalText(parsedBody.data.region),
      country: normalizeOptionalText(parsedBody.data.country ?? undefined),
      postcode: normalizeOptionalText(parsedBody.data.postcode),
      lat: parsedBody.data.lat,
      lng: parsedBody.data.lng,
      websiteUrl: normalizeOptionalText(parsedBody.data.websiteUrl ?? undefined),
      instagramUrl: normalizeOptionalText(parsedBody.data.instagramUrl ?? undefined),
    });

    await deps.ensureOwnerMembership(venue.id, user.id);
    await deps.upsertVenueDraftSubmission(venue.id, user.id);
    await deps.setOnboardingFlag(user);
    await deps.logAudit({ action: "VENUE_CREATED_SELF_SERVE", user, venue, reused: false, createKey, req });

    return NextResponse.json({ venue, created: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof VenueLimitReachedError) {
      return NextResponse.json({ error: "venue_limit_reached", limit: error.limit }, { status: 400 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Forbidden");
    }
    if (error instanceof VenueSlugExhaustedError) return apiError(400, "invalid_request", error.message);
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export const __internal = { buildCreateKey };
