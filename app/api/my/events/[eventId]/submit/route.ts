import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth";
import { eventIdParamSchema, zodDetails } from "@/lib/validators";
import { submissionSubmittedDedupeKey } from "@/lib/notification-keys";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, rateLimitErrorResponse } from "@/lib/rate-limit";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { evaluateEventReadiness } from "@/lib/publish-readiness";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireAuth();
    await enforceRateLimit({ key: `submissions:submit:user:${user.id}`, limit: RATE_LIMITS.submissions.limit, windowMs: RATE_LIMITS.submissions.windowMs });

    const parsedId = eventIdParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const event = await db.event.findFirst({
      where: {
        id: parsedId.data.eventId,
        OR: [
          { submissions: { some: { submitterUserId: user.id, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] } } },
          { venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } },
        ],
      },
      select: { id: true, title: true, description: true, startAt: true, endAt: true, venueId: true, ticketUrl: true, isPublished: true, status: true, featuredAssetId: true },
    });
    if (!event) return apiError(403, "forbidden", "Submission owner required");

    const readiness = evaluateEventReadiness(event, event.venueId ? { id: event.venueId } : null);
    if (!readiness.ready) return NextResponse.json({ error: "NOT_READY", message: "Complete required fields before submitting.", blocking: readiness.blocking, warnings: readiness.warnings }, { status: 400 });

    const latest = await db.submission.findFirst({ where: { targetEventId: event.id, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true } });
    if (event.status === "IN_REVIEW") return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission is already pending review." }, { status: 409 });
    if (event.status === "PUBLISHED") return NextResponse.json({ error: "ALREADY_APPROVED", message: "Event is already approved and published." }, { status: 409 });

    const created = await db.submission.create({ data: { type: "EVENT", kind: "PUBLISH", status: "SUBMITTED", submitterUserId: user.id, venueId: event.venueId, targetEventId: event.id, submittedAt: new Date(), decisionReason: null, decidedAt: null, decidedByUserId: null } });

    await db.event.update({ where: { id: event.id }, data: { status: "IN_REVIEW", submittedAt: new Date() } });

    await enqueueNotification({ type: "SUBMISSION_SUBMITTED", toEmail: user.email, dedupeKey: submissionSubmittedDedupeKey(created.id), payload: { submissionId: created.id, status: created.status, submittedAt: created.submittedAt?.toISOString() ?? null }, inApp: buildInAppFromTemplate(user.id, "SUBMISSION_SUBMITTED", { type: "SUBMISSION_SUBMITTED", submissionId: created.id, submissionType: "EVENT" }) });
    await setOnboardingFlagForSession(user, "hasSubmittedEvent", true, { path: "/api/my/events/[eventId]/submit" });
    return NextResponse.json(created);
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
