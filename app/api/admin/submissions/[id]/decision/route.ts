import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { idParamSchema, parseBody, zodDetails } from "@/lib/validators";
import { submissionDecisionDedupeKey } from "@/lib/notification-keys";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, rateLimitErrorResponse } from "@/lib/rate-limit";
import { decideSubmission, ModerationDecisionError } from "@/lib/moderation-decision-service";

export const runtime = "nodejs";

const submissionDecisionRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().min(1).optional().nullable(),
});

function isSubmissionDecisionStatus(status: string): status is "APPROVED" | "REJECTED" {
  return status === "APPROVED" || status === "REJECTED";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireEditor();

    await enforceRateLimit({
      key: `submissions:decision:user:${user.id}`,
      limit: RATE_LIMITS.submissions.limit,
      windowMs: RATE_LIMITS.submissions.windowMs,
    });

    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const parsedBody = submissionDecisionRequestSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const rejectionReason = parsedBody.data.rejectionReason ?? undefined;
    if (parsedBody.data.decision === "REJECTED" && !rejectionReason) {
      return apiError(400, "invalid_request", "Rejection reason is required when rejecting a submission");
    }

    const result = await decideSubmission({
      submissionId: parsedId.data.id,
      actor: { id: user.id, email: user.email, role: user.role },
      decision: parsedBody.data.decision === "APPROVED" ? "APPROVE" : "REJECT",
      rejectionReason,
    });

    if (result.idempotent) return apiError(409, "invalid_state", "Submission is not pending moderation");

    if (!isSubmissionDecisionStatus(result.submission.status)) {
      return apiError(500, "internal_error", "Unexpected submission status after moderation decision");
    }

    await enqueueNotification({
      type: result.submission.status === "APPROVED" ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED",
      toEmail: result.submitterEmail,
      dedupeKey: submissionDecisionDedupeKey(result.submission.id, result.submission.status),
      payload: {
        submissionId: result.submission.id,
        status: result.submission.status,
        decisionReason: result.submission.decisionReason,
        decidedAt: result.submission.decidedAt?.toISOString() ?? null,
      },
      inApp: buildInAppFromTemplate(result.submitterId, result.submission.status === "APPROVED" ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED", {
        type: result.submission.status === "APPROVED" ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED",
        submissionId: result.submission.id,
        submissionType: result.submission.type,
        targetVenueId: result.submission.targetVenueId,
        decisionReason: result.submission.decisionReason,
      }),
    });

    return NextResponse.json(result.submission);
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (error instanceof ModerationDecisionError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Editor role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
