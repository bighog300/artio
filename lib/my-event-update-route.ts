import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { canEditSubmission } from "@/lib/ownership";
import { eventIdParamSchema, myEventPatchSchema, parseBody, zodDetails } from "@/lib/validators";
import type { EventTypeOption } from "@/lib/event-types";

type SessionUser = { id: string };

type SubmissionRecord = {
  id: string;
  submitterUserId: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  venue: { memberships: Array<{ id: string }> } | null;
  targetEvent: { isPublished: boolean } | null;
};

type UpdateEventInput = {
  title?: string;
  slug?: string;
  description?: string | null;
  timezone?: string;
  startAt?: Date;
  endAt?: Date | null;
  venueId?: string | null;
  featuredAssetId?: string | null;
  eventType?: EventTypeOption | null;
  images?: Array<{ assetId?: string | null; url?: string | null; alt?: string | null; sortOrder: number }>;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  findSubmission: (eventId: string, userId: string) => Promise<SubmissionRecord | null>;
  countOwnedAssets: (assetIds: string[], userId: string) => Promise<number>;
  hasVenueMembership: (userId: string, venueId: string) => Promise<boolean>;
  updateEvent: (eventId: string, data: UpdateEventInput) => Promise<unknown>;
  updateSubmissionVenue: (submissionId: string, venueId: string | null) => Promise<void>;
  updateSubmissionNote: (submissionId: string, note: string | null) => Promise<void>;
};

export async function handlePatchMyEvent(req: NextRequest, params: Promise<{ eventId: string }>, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const parsedId = eventIdParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const parsed = myEventPatchSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const submission = await deps.findSubmission(parsedId.data.eventId, user.id);

    if (!submission || submission.submitterUserId !== user.id) return apiError(403, "forbidden", "Submission owner required");
    if (submission.targetEvent?.isPublished) return apiError(400, "invalid_request", "Published events must use revision workflow");
    if (submission.venue && !submission.venue.memberships.length) return apiError(403, "forbidden", "Venue membership required");
    if (!canEditSubmission(submission.status)) return apiError(409, "invalid_state", "Only draft or rejected submissions are editable");

    if (parsed.data.venueId !== undefined && parsed.data.venueId !== null) {
      const hasMembership = await deps.hasVenueMembership(user.id, parsed.data.venueId);
      if (!hasMembership) return apiError(403, "forbidden", "Venue membership required");
    }

    const { note, images } = parsed.data;

    const imageAssetIds = (images ?? []).map((image) => image.assetId).filter((assetId): assetId is string => Boolean(assetId));
    const featuredAssetIds = parsed.data.featuredAssetId ? [parsed.data.featuredAssetId] : [];
    const assetIds = [...new Set([...imageAssetIds, ...featuredAssetIds])];

    if (assetIds.length) {
      const ownedCount = await deps.countOwnedAssets(assetIds, user.id);
      if (ownedCount !== assetIds.length) return apiError(403, "forbidden", "Can only use your own uploaded assets");
    }

    const updateInput: UpdateEventInput = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      ...(parsed.data.startAt ? { startAt: new Date(parsed.data.startAt) } : {}),
      ...(Object.prototype.hasOwnProperty.call(parsed.data, "endAt") ? { endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null } : {}),
      ...(Object.prototype.hasOwnProperty.call(parsed.data, "venueId") ? { venueId: parsed.data.venueId ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(parsed.data, "featuredAssetId") ? { featuredAssetId: parsed.data.featuredAssetId ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(parsed.data, "eventType") ? { eventType: parsed.data.eventType ?? null } : {}),
      ...(images ? { images } : {}),
    };

    const event = await deps.updateEvent(parsedId.data.eventId, updateInput);

    if (parsed.data.venueId !== undefined) {
      await deps.updateSubmissionVenue(submission.id, parsed.data.venueId ?? null);
    }

    if (note !== undefined) {
      await deps.updateSubmissionNote(submission.id, note ?? null);
    }

    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
