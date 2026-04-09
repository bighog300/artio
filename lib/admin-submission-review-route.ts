import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { adminSubmissionRequestChangesSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { submissionDecisionDedupeKey } from "@/lib/notification-keys";
import { applyEventRevision } from "@/lib/event-revision";
import { isAuthError } from "@/lib/auth";
import { ForbiddenError } from "@/lib/http-errors";

type AdminUser = { id: string };

type SubmissionDetail = {
  id: string;
  type: "EVENT" | "VENUE" | "ARTIST" | "ARTWORK";
  kind: "PUBLISH" | "REVISION" | null;
  details?: unknown;
  targetEventId: string | null;
  targetVenueId: string | null;
  targetArtistId: string | null;
  status: "IN_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT";
  submitter: { id: string; email: string };
  targetVenue: { slug: string | null } | null;
  targetArtist: { slug: string | null } | null;
};

type ReviewDeps = {
  requireAdmin: () => Promise<AdminUser>;
  findSubmission: (id: string) => Promise<SubmissionDetail | null>;
  publishVenue: (venueId: string) => Promise<void>;
  setVenueDraft: (venueId: string) => Promise<void>;
  publishArtist: (artistId: string) => Promise<void>;
  setArtistDraft: (artistId: string) => Promise<void>;
  publishEvent: (eventId: string) => Promise<void>;
  setEventDraft: (eventId: string) => Promise<void>;
  findEventUpdatedAt: (eventId: string) => Promise<Date | null>;
  applyEventRevisionUpdate: (eventId: string, data: Record<string, unknown>) => Promise<void>;
  markApproved: (submissionId: string, decidedByUserId: string) => Promise<void>;
  markNeedsChanges: (submissionId: string, decidedByUserId: string, message: string) => Promise<void>;
  notifyApproved?: (submission: SubmissionDetail) => Promise<void>;
  notifyNeedsChanges?: (submission: SubmissionDetail, message: string) => Promise<void>;
  listConfirmedRegistrantEmails?: (eventId: string) => Promise<string[]>;
  enqueueEventChangeNotification?: (args: { eventId: string; submissionId: string; email: string; eventTitle: string; eventSlug: string }) => Promise<void>;

};

async function parseSubmissionId(params: Promise<{ id: string }>) {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) return { error: apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error)) };
  return { submissionId: parsed.data.id };
}

export async function handleApproveSubmission(params: Promise<{ id: string }>, deps: ReviewDeps) {
  try {
    const parsedId = await parseSubmissionId(params);
    if ("error" in parsedId) return parsedId.error;

    const admin = await deps.requireAdmin();
    const submission = await deps.findSubmission(parsedId.submissionId);
    if (!submission) return apiError(400, "invalid_request", "Submission not found");
    if (submission.status !== "IN_REVIEW") return apiError(400, "invalid_request", "Submission is not pending review");

    if (submission.type === "VENUE") {
      if (!submission.targetVenueId || submission.kind !== "PUBLISH") return apiError(400, "invalid_request", "Venue submission not found");
      await deps.publishVenue(submission.targetVenueId);
    } else if (submission.type === "ARTIST") {
      if (!submission.targetArtistId || submission.kind !== "PUBLISH") return apiError(400, "invalid_request", "Artist submission not found");
      await deps.publishArtist(submission.targetArtistId);
    } else {
      if (!submission.targetEventId) return apiError(400, "invalid_request", "Event submission not found");
      if (submission.kind === "REVISION") {
        const details = submission.details;
        if (!details || typeof details !== "object") return apiError(400, "invalid_request", "Revision payload is missing");
        const proposed = (details as Record<string, unknown>).proposed;
        const baseEventUpdatedAt = (details as Record<string, unknown>).baseEventUpdatedAt;
        if (!proposed || typeof proposed !== "object" || typeof baseEventUpdatedAt !== "string") {
          return apiError(400, "invalid_request", "Revision payload is invalid");
        }
        const eventUpdatedAt = await deps.findEventUpdatedAt(submission.targetEventId);
        if (!eventUpdatedAt) return apiError(400, "invalid_request", "Event submission not found");
        if (eventUpdatedAt.getTime() > new Date(baseEventUpdatedAt).getTime()) {
          return apiError(400, "invalid_request", "Event changed since this revision was created; please re-submit revision");
        }
        await deps.applyEventRevisionUpdate(submission.targetEventId, applyEventRevision(proposed as Record<string, unknown>));

        if (deps.listConfirmedRegistrantEmails && deps.enqueueEventChangeNotification) {
          const eventTitle = typeof (proposed as Record<string, unknown>).title === "string"
            ? (proposed as Record<string, unknown>).title as string
            : "Event";
          const eventSlug = typeof (proposed as Record<string, unknown>).slug === "string"
            ? (proposed as Record<string, unknown>).slug as string
            : null;

          if (eventSlug) {
            const targetEventId = submission.targetEventId!;
            const emails = await deps.listConfirmedRegistrantEmails(targetEventId);
            await Promise.all(emails.map((email) => deps.enqueueEventChangeNotification!({
              eventId: targetEventId,
              submissionId: submission.id,
              email,
              eventTitle,
              eventSlug,
            })));
          }
        }
      } else {
        await deps.publishEvent(submission.targetEventId);
      }
    }

    await deps.markApproved(submission.id, admin.id);

    if (deps.notifyApproved) {
      await deps.notifyApproved(submission);
    } else {
      await enqueueNotification({
        type: "SUBMISSION_APPROVED",
        toEmail: submission.submitter.email,
        dedupeKey: submissionDecisionDedupeKey(submission.id, "APPROVED"),
        payload: { submissionId: submission.id, status: "APPROVED" },
        inApp: buildInAppFromTemplate(submission.submitter.id, "SUBMISSION_APPROVED", {
          type: "SUBMISSION_APPROVED",
          submissionId: submission.id,
          submissionType: submission.type,
          targetVenueSlug: submission.targetVenue?.slug ?? undefined,
          targetArtistSlug: submission.targetArtist?.slug ?? undefined,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error) || (error instanceof Error && error.message === "unauthorized")) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof ForbiddenError || (error instanceof Error && error.message === "forbidden")) return apiError(403, "forbidden", "Admin role required");
    console.error("submissions_approve_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleRequestChangesSubmission(req: NextRequest, params: Promise<{ id: string }>, deps: ReviewDeps) {
  try {
    const parsedId = await parseSubmissionId(params);
    if ("error" in parsedId) return parsedId.error;

    const parsedBody = adminSubmissionRequestChangesSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const admin = await deps.requireAdmin();
    const submission = await deps.findSubmission(parsedId.submissionId);
    if (!submission) return apiError(400, "invalid_request", "Submission not found");
    if (submission.status !== "IN_REVIEW") return apiError(400, "invalid_request", "Submission is not pending review");

    if (submission.type === "VENUE") {
      if (!submission.targetVenueId || submission.kind !== "PUBLISH") return apiError(400, "invalid_request", "Venue submission not found");
      await deps.setVenueDraft(submission.targetVenueId);
    } else if (submission.type === "ARTIST") {
      if (!submission.targetArtistId || submission.kind !== "PUBLISH") return apiError(400, "invalid_request", "Artist submission not found");
      await deps.setArtistDraft(submission.targetArtistId);
    } else if (submission.kind !== "REVISION") {
      if (!submission.targetEventId) return apiError(400, "invalid_request", "Event submission not found");
      await deps.setEventDraft(submission.targetEventId);
    }

    await deps.markNeedsChanges(submission.id, admin.id, parsedBody.data.message);

    if (deps.notifyNeedsChanges) {
      await deps.notifyNeedsChanges(submission, parsedBody.data.message);
    } else {
      await enqueueNotification({
        type: "SUBMISSION_REJECTED",
        toEmail: submission.submitter.email,
        dedupeKey: submissionDecisionDedupeKey(submission.id, "REJECTED"),
        payload: { submissionId: submission.id, status: "REJECTED", decisionReason: parsedBody.data.message },
        inApp: buildInAppFromTemplate(submission.submitter.id, "SUBMISSION_REJECTED", {
          type: "SUBMISSION_REJECTED",
          submissionId: submission.id,
          submissionType: submission.type,
          targetVenueId: submission.targetVenueId,
          targetArtistId: submission.targetArtistId,
          decisionReason: parsedBody.data.message,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error) || (error instanceof Error && error.message === "unauthorized")) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof ForbiddenError || (error instanceof Error && error.message === "forbidden")) return apiError(403, "forbidden", "Admin role required");
    console.error("submissions_request_changes_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
