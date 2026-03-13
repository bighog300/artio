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
  timezone?: string | null;
  ticketUrl: string | null;
  isPublished: boolean;
  deletedAt: Date | null;
  venue?: { status?: string | null; isPublished?: boolean | null } | null;
  status?: string | null;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  canEditEvent: (eventId: string, user: SessionUser) => Promise<boolean>;
  findEventForPublish: (eventId: string) => Promise<EventRecord | null>;
  updateEventPublishState: (eventId: string, isPublished: boolean) => Promise<EventRecord & { slug?: string | null }>;
  logAdminAction: (input: AdminAuditInput) => Promise<void>;
  onPublished?: (event: EventRecord & { slug?: string | null }) => Promise<void>;
};

export async function handleEventSelfPublish(req: NextRequest, input: { eventId: string; isPublished: boolean }, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const canEdit = await deps.canEditEvent(input.eventId, user);
    if (!canEdit) return apiError(403, "forbidden", "Venue membership required");
    if (input.isPublished && !canSelfPublish(user)) return apiError(403, "forbidden", "Direct publishing not permitted");

    const event = await deps.findEventForPublish(input.eventId);
    if (!event) return apiError(404, "not_found", "Event not found");
    if (event.deletedAt) return apiError(409, "invalid_state", "Archived events cannot be directly published");

    if (input.isPublished) {
      const readiness = evaluateEventReadiness(event, event.venueId ? { id: event.venueId } : null);
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error: "publish_blocked",
            blockers: readiness.blocking.map((blocker) => ({ id: blocker.id, message: blocker.label })),
          },
          { status: 409 },
        );
      }
    }

    const updated = await deps.updateEventPublishState(input.eventId, input.isPublished);
    if (input.isPublished && deps.onPublished) await deps.onPublished(updated);
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
