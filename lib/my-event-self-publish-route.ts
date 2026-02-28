import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { canSelfPublish } from "@/lib/auth";
import type { AdminAuditInput } from "@/lib/admin-audit";
import { evaluateEventReadiness } from "@/lib/publish-readiness";

type SessionUser = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN"; isTrustedPublisher?: boolean | null };

type EventRecord = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  venueId: string | null;
  ticketUrl: string | null;
  isPublished: boolean;
  deletedAt: Date | null;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  canEditEvent: (eventId: string, user: SessionUser) => Promise<boolean>;
  findEventForPublish: (eventId: string) => Promise<EventRecord | null>;
  updateEventPublishState: (eventId: string, isPublished: boolean) => Promise<EventRecord>;
  logAdminAction: (input: AdminAuditInput) => Promise<void>;
};

export async function handleEventSelfPublish(req: NextRequest, input: { eventId: string; isPublished: boolean }, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const canEdit = await deps.canEditEvent(input.eventId, user);
    if (!canEdit) return apiError(403, "forbidden", "Venue membership required");
    if (!canSelfPublish(user)) return apiError(403, "forbidden", "Direct publishing not permitted");

    const event = await deps.findEventForPublish(input.eventId);
    if (!event) return apiError(404, "not_found", "Event not found");
    if (event.deletedAt) return apiError(409, "invalid_state", "Archived events cannot be directly published");

    if (input.isPublished) {
      const readiness = evaluateEventReadiness(event, event.venueId ? { id: event.venueId } : null);
      if (!readiness.ready) {
        return NextResponse.json({ error: "NOT_READY", message: "Complete required fields before publishing.", blocking: readiness.blocking, warnings: readiness.warnings }, { status: 400 });
      }
    }

    const updated = await deps.updateEventPublishState(input.eventId, input.isPublished);
    await deps.logAdminAction({
      actorEmail: user.email,
      action: "EVENT_SELF_PUBLISH_TOGGLED",
      targetType: "event",
      targetId: updated.id,
      metadata: { isPublished: updated.isPublished },
      req,
    });

    return NextResponse.json({ event: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
