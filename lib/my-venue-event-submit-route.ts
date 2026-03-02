import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evaluateEventReadiness } from "@/lib/publish-readiness";
import { eventSubmitBodySchema, parseBody, venueEventSubmitParamSchema, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { submissionSubmittedDedupeKey } from "@/lib/notification-keys";

type SessionUser = { id: string; email: string };

type EventRecord = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  description: string | null;
  venueId: string | null;
  ticketUrl: string | null;
  isPublished: boolean;
  images: Array<{ id: string }>;
};

type SubmissionRecord = { id: string; status: string; createdAt: Date; submittedAt: Date | null };

type SubmitEventDeps = {
  getLatestSubmissionStatus: (eventId: string) => Promise<"DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | null>;
  requireAuth: () => Promise<SessionUser>;
  requireVenueMembership: (userId: string, venueId: string) => Promise<void>;
  findEventForSubmit: (eventId: string, venueId: string) => Promise<EventRecord | null>;
  createSubmission: (input: { venueId: string; eventId: string; userId: string; message?: string }) => Promise<SubmissionRecord>;
  enqueueSubmissionNotification?: (input: { userId: string; email: string; submissionId: string; status: string; submittedAt: Date | null; venueId: string }) => Promise<void>;
};

export async function handleVenueEventSubmit(req: NextRequest, params: Promise<{ venueId: string; eventId: string }>, deps: SubmitEventDeps) {
  try {
    const parsedParams = venueEventSubmitParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedParams.data.venueId);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `event-submit:${parsedParams.data.venueId}`, user.id),
      limit: RATE_LIMITS.eventSubmitWrite.limit,
      windowMs: RATE_LIMITS.eventSubmitWrite.windowMs,
    });

    const parsedBody = eventSubmitBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const event = await deps.findEventForSubmit(parsedParams.data.eventId, parsedParams.data.venueId);
    if (!event) return apiError(400, "invalid_request", "Event not found");
    if (event.isPublished) return apiError(400, "invalid_request", "Published events cannot be submitted for review");

    const readiness = evaluateEventReadiness(event, event.venueId ? { id: event.venueId } : null);
    if (!readiness.ready) {
      console.warn("FAIL_REASON=NOT_READY entity=event");
      return NextResponse.json({
        error: "NOT_READY",
        message: "Complete required fields before submitting.",
        blocking: readiness.blocking,
        warnings: readiness.warnings,
      }, { status: 400 });
    }

    const latestStatus = await deps.getLatestSubmissionStatus(event.id);
    if (latestStatus === "IN_REVIEW") return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission is already pending review." }, { status: 409 });
    if (latestStatus === "APPROVED" && event.isPublished) return NextResponse.json({ error: "ALREADY_APPROVED", message: "Event is already approved and published." }, { status: 409 });

    const submission = await deps.createSubmission({
      venueId: parsedParams.data.venueId,
      eventId: event.id,
      userId: user.id,
      message: parsedBody.data.message,
    });

    if (deps.enqueueSubmissionNotification) {
      await deps.enqueueSubmissionNotification({
        userId: user.id,
        email: user.email,
        submissionId: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        venueId: parsedParams.data.venueId,
      });
    } else {
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
          submissionType: "EVENT",
          targetVenueId: parsedParams.data.venueId,
        }),
      });
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        status: submission.status,
        createdAt: submission.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue membership required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
