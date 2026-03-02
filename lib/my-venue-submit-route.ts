import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evaluateVenueReadiness } from "@/lib/publish-readiness";
import { parseBody, venueIdParamSchema, venueSubmitBodySchema, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { submissionSubmittedDedupeKey } from "@/lib/notification-keys";
import type { ContentStatus } from "@prisma/client";

type SessionUser = { id: string; email: string };
type SubmissionStatus = ContentStatus | null;

type VenueRecord = { id: string; name: string; description: string | null; featuredAssetId: string | null; featuredImageUrl: string | null; addressLine1: string | null; city: string | null; country: string | null; websiteUrl: string | null; images: Array<{ id: string }>; isPublished?: boolean };
type SubmissionRecord = { id: string; status: string; createdAt: Date; submittedAt: Date | null };

type SubmitVenueDeps = {
  requireAuth: () => Promise<SessionUser>;
  requireVenueMembership: (userId: string, venueId: string) => Promise<void>;
  findVenueForSubmit: (venueId: string) => Promise<VenueRecord | null>;
  getLatestSubmissionStatus: (venueId: string) => Promise<SubmissionStatus | null>;
  createSubmission: (input: { venueId: string; userId: string; message?: string }) => Promise<SubmissionRecord>;
  setVenuePublishedDraft: (venueId: string) => Promise<void>;
  enqueueSubmissionNotification?: (input: { userId: string; email: string; submissionId: string; status: string; submittedAt: Date | null; venueId: string }) => Promise<void>;
};

export async function handleVenueSubmit(req: NextRequest, params: Promise<{ id: string }>, deps: SubmitVenueDeps) {
  try {
    const parsedId = venueIdParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedId.data.id);
    await enforceRateLimit({ key: principalRateLimitKey(req, `venue-submit:${parsedId.data.id}`, user.id), limit: RATE_LIMITS.venueSubmitWrite.limit, windowMs: RATE_LIMITS.venueSubmitWrite.windowMs });

    const parsedBody = venueSubmitBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const venue = await deps.findVenueForSubmit(parsedId.data.id);
    if (!venue) return apiError(400, "invalid_request", "Venue not found");

    const latestStatus = await deps.getLatestSubmissionStatus(venue.id);
    if (latestStatus === "IN_REVIEW") return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission is already pending review." }, { status: 409 });
    if (latestStatus === "APPROVED" && venue.isPublished) return NextResponse.json({ error: "ALREADY_APPROVED", message: "Venue is already approved and published." }, { status: 409 });

    const readiness = evaluateVenueReadiness(venue);
    if (!readiness.ready) {
      console.warn("FAIL_REASON=NOT_READY entity=venue");
      return NextResponse.json({ error: "NOT_READY", message: "Complete required fields before submitting.", blocking: readiness.blocking, warnings: readiness.warnings }, { status: 400 });
    }

    await deps.setVenuePublishedDraft(venue.id);
    const submission = await deps.createSubmission({ venueId: venue.id, userId: user.id, message: parsedBody.data.message });

    if (deps.enqueueSubmissionNotification) await deps.enqueueSubmissionNotification({ userId: user.id, email: user.email, submissionId: submission.id, status: submission.status, submittedAt: submission.submittedAt, venueId: venue.id });
    else await enqueueNotification({ type: "SUBMISSION_SUBMITTED", toEmail: user.email, dedupeKey: submissionSubmittedDedupeKey(submission.id), payload: { submissionId: submission.id, status: submission.status, submittedAt: submission.submittedAt?.toISOString() ?? null }, inApp: buildInAppFromTemplate(user.id, "SUBMISSION_SUBMITTED", { type: "SUBMISSION_SUBMITTED", submissionId: submission.id, submissionType: "VENUE", targetVenueId: venue.id }) });

    return NextResponse.json({ submission: { id: submission.id, status: submission.status, createdAt: submission.createdAt.toISOString() } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue editor role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
