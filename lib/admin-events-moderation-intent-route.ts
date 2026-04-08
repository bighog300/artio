import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { ok, parseModerationIntentBody } from "@/lib/admin-moderation-intent";
import { computeEventPublishBlockers } from "@/lib/publish-readiness";
import { Prisma } from "@prisma/client";

type EventRecord = {
  id: string;
  slug: string | null;
  deletedAt: Date | null;
  isPublished: boolean;
  status: string | null;
  startAt: Date | null;
  timezone: string | null;
  venue: { status: string | null; isPublished: boolean | null } | null;
  _count: { images: number };
};

type Deps = {
  requireAdminUser: () => Promise<{ email: string | null }>;
  findEvent: (id: string) => Promise<EventRecord | null>;
  updateEvent: (id: string, data: Record<string, unknown>) => Promise<void>;
  createAuditLog: (params: {
    actorEmail: string | null;
    targetId: string;
    metadata: { action: string; reason?: string };
  }) => Promise<void>;
  findLatestSubmissionSubmitter: (eventId: string) => Promise<{ id: string; email: string } | null>;
  enqueueModerationNotification: (params: {
    type: "SUBMISSION_APPROVED" | "SUBMISSION_REJECTED";
    toEmail: string;
    dedupeKey: string;
    payload: Prisma.InputJsonValue;
  }) => Promise<void>;
  onPublished?: (eventId: string) => Promise<void>;
  onArchived?: (eventId: string) => Promise<void>;
};

export async function handleEventModerationIntent(req: Request, params: { id: string }, deps: Deps) {
  let adminUser: { email: string | null };
  try {
    adminUser = await deps.requireAdminUser();
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(403, "forbidden", "Admin role required");
  }

  const parsedId = idParamSchema.safeParse(params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = await parseModerationIntentBody(req);
  if ("error" in parsedBody) return parsedBody.error;

  const event = await deps.findEvent(parsedId.data.id);
  if (!event) return apiError(404, "not_found", "Event not found");

  if (parsedBody.action === "approve_publish") {
    if (event.isPublished || event.status === "PUBLISHED") {
      return ok({ ok: true, status: "PUBLISHED", message: "Already published." });
    }

    const blockers = computeEventPublishBlockers({
      startAt: event.startAt,
      timezone: event.timezone,
      venue: event.venue,
      hasImage: event._count.images > 0,
    });
    if (blockers.length > 0) {
      return apiError(409, "publish_blocked", "Publishing is blocked", { blockers });
    }

    await deps.updateEvent(event.id, { status: "PUBLISHED", isPublished: true, publishedAt: new Date(), reviewedAt: new Date(), reviewNotes: null });
    await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action } });
    try {
      const submitter = await deps.findLatestSubmissionSubmitter(event.id);
      if (submitter) {
        await deps.enqueueModerationNotification({
          type: "SUBMISSION_APPROVED",
          toEmail: submitter.email,
          dedupeKey: `moderation-intent:event:${event.id}:${parsedBody.action}:${Date.now()}`,
          payload: { eventId: event.id, action: parsedBody.action },
        });
      }
    } catch {}
    if (deps.onPublished) await deps.onPublished(event.id);
    return ok({ ok: true, status: "PUBLISHED", message: "Event approved and published.", publicUrl: event.slug ? `/events/${event.slug}` : undefined });
  }
  if (parsedBody.action === "request_changes") {
    await deps.updateEvent(event.id, { status: "CHANGES_REQUESTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason });
    await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } });
    try {
      const submitter = await deps.findLatestSubmissionSubmitter(event.id);
      if (submitter) {
        await deps.enqueueModerationNotification({
          type: "SUBMISSION_REJECTED",
          toEmail: submitter.email,
          dedupeKey: `moderation-intent:event:${event.id}:${parsedBody.action}:${Date.now()}`,
          payload: { eventId: event.id, action: parsedBody.action, reason: parsedBody.reason },
        });
      }
    } catch {}
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }
  if (parsedBody.action === "reject") {
    await deps.updateEvent(event.id, { status: "REJECTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason });
    await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } });
    try {
      const submitter = await deps.findLatestSubmissionSubmitter(event.id);
      if (submitter) {
        await deps.enqueueModerationNotification({
          type: "SUBMISSION_REJECTED",
          toEmail: submitter.email,
          dedupeKey: `moderation-intent:event:${event.id}:${parsedBody.action}:${Date.now()}`,
          payload: { eventId: event.id, action: parsedBody.action, reason: parsedBody.reason },
        });
      }
    } catch {}
    return ok({ ok: true, status: "REJECTED", message: "Event rejected." });
  }
  if (parsedBody.action === "unpublish") {
    await deps.updateEvent(event.id, { status: "APPROVED", isPublished: false });
    await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action } });
    return ok({ ok: true, status: "APPROVED", message: "Event unpublished." });
  }
  if (parsedBody.action === "restore") {
    await deps.updateEvent(event.id, { status: "APPROVED", deletedAt: null, deletedReason: null });
    await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action } });
    return ok({ ok: true, status: "APPROVED", message: "Event restored." });
  }
  await deps.updateEvent(event.id, { status: "ARCHIVED", isPublished: false, deletedAt: event.deletedAt ?? new Date() });
  await deps.createAuditLog({ actorEmail: adminUser.email, targetId: event.id, metadata: { action: parsedBody.action } });
  if (deps.onArchived) await deps.onArchived(event.id);
  return ok({ ok: true, status: "ARCHIVED", message: "Event archived." });
}
