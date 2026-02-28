import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { CreateEventSchema, parseBody, zodDetails } from "@/lib/validators";
import { ensureUniqueEventSlugWithDeps, slugifyEventTitle } from "@/lib/event-slug";
import type { EventTypeOption } from "@/lib/event-types";

type SessionUser = { id: string; email?: string | null };

type ManagedVenue = { id: string; role: "OWNER" | "EDITOR" };

type EventRecord = {
  id: string;
  slug: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  venueId: string | null;
  isPublished: boolean;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  listManagedVenues: (userId: string) => Promise<ManagedVenue[]>;
  findExistingDraftByCreateKey: (input: { userId: string; createKey: string; startAt: Date; venueId: string | null }) => Promise<EventRecord | null>;
  findEventBySlug: (slug: string) => Promise<{ id: string } | null>;
  createEvent: (input: {
    title: string;
    slug: string;
    startAt: Date;
    endAt: Date | null;
    venueId: string | null;
    ticketUrl: string | null;
    timezone: string;
    eventType: EventTypeOption;
  }) => Promise<EventRecord>;
  upsertEventDraftSubmission: (eventId: string, userId: string, venueId: string | null) => Promise<void>;
  setOnboardingFlag: (user: SessionUser) => Promise<void>;
  logAudit: (args: {
    action: string;
    user: SessionUser;
    event: EventRecord;
    reused: boolean;
    createKey: string;
    req: NextRequest;
    missingVenue: boolean;
  }) => Promise<void>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function normalizeKeyPart(input?: string | null) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCreateKey(input: { title: string; startAtIso: string; venueId?: string | null }) {
  return [normalizeKeyPart(input.title), input.startAtIso, input.venueId ?? "none"].join("|");
}

export async function handlePostMyEvent(req: NextRequest, deps: Deps) {
  let user: SessionUser;
  try {
    user = await deps.requireAuth();
  } catch {
    return apiError(401, "unauthorized", "Authentication required");
  }

  try {
    const parsedBody = CreateEventSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const managedVenues = await deps.listManagedVenues(user.id);
    const managedVenueIds = new Set(managedVenues.map((venue) => venue.id));

    let resolvedVenueId = parsedBody.data.venueId ?? null;
    if (resolvedVenueId) {
      if (!managedVenueIds.has(resolvedVenueId)) return apiError(403, "forbidden", "Venue membership required");
    } else if (managedVenues.length === 1) {
      resolvedVenueId = managedVenues[0]!.id;
    } else if (managedVenues.length > 1) {
      return apiError(400, "invalid_request", "Select a venue");
    }

    const startAt = new Date(parsedBody.data.startAt);
    const endAt = parsedBody.data.endAt ? new Date(parsedBody.data.endAt) : null;
    const timezone = parsedBody.data.timezone?.trim() || "UTC";

    const createKey = buildCreateKey({
      title: parsedBody.data.title,
      startAtIso: startAt.toISOString(),
      venueId: resolvedVenueId,
    });

    const existing = await deps.findExistingDraftByCreateKey({
      userId: user.id,
      createKey,
      startAt,
      venueId: resolvedVenueId,
    });

    if (existing) {
      await deps.upsertEventDraftSubmission(existing.id, user.id, existing.venueId);
      await deps.setOnboardingFlag(user);
      await deps.logAudit({ action: "EVENT_CREATED_SELF_SERVE", user, event: existing, reused: true, createKey, req, missingVenue: existing.venueId == null });
      return NextResponse.json({ event: existing, created: false, missingVenue: existing.venueId == null }, { headers: NO_STORE_HEADERS });
    }

    const slug = await ensureUniqueEventSlugWithDeps(
      { findBySlug: deps.findEventBySlug },
      slugifyEventTitle(parsedBody.data.title),
    );

    const event = await deps.createEvent({
      title: parsedBody.data.title,
      slug,
      startAt,
      endAt,
      venueId: resolvedVenueId,
      ticketUrl: parsedBody.data.ticketUrl ?? null,
      timezone,
      eventType: parsedBody.data.eventType ?? "OTHER",
    });

    await deps.upsertEventDraftSubmission(event.id, user.id, resolvedVenueId);
    await deps.setOnboardingFlag(user);
    await deps.logAudit({ action: "EVENT_CREATED_SELF_SERVE", user, event, reused: false, createKey, req, missingVenue: resolvedVenueId == null });

    return NextResponse.json({ event, created: true, missingVenue: resolvedVenueId == null }, { headers: NO_STORE_HEADERS });
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export const __internal = { buildCreateKey };
