import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { ok, parseModerationIntentBody } from "@/lib/admin-moderation-intent";

type EventRecord = { id: string; slug: string | null; deletedAt: Date | null };

type Deps = {
  requireAdminUser: () => Promise<void>;
  findEvent: (id: string) => Promise<EventRecord | null>;
  updateEvent: (id: string, data: Record<string, unknown>) => Promise<void>;
  onPublished?: (eventId: string) => Promise<void>;
};

export async function handleEventModerationIntent(req: Request, params: { id: string }, deps: Deps) {
  try {
    await deps.requireAdminUser();
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
    await deps.updateEvent(event.id, { status: "PUBLISHED", isPublished: true, publishedAt: new Date(), reviewedAt: new Date(), reviewNotes: null });
    if (deps.onPublished) await deps.onPublished(event.id);
    return ok({ ok: true, status: "PUBLISHED", message: "Event approved and published.", publicUrl: event.slug ? `/events/${event.slug}` : undefined });
  }
  if (parsedBody.action === "request_changes") {
    await deps.updateEvent(event.id, { status: "CHANGES_REQUESTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason });
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }
  if (parsedBody.action === "reject") {
    await deps.updateEvent(event.id, { status: "REJECTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason });
    return ok({ ok: true, status: "REJECTED", message: "Event rejected." });
  }
  if (parsedBody.action === "unpublish") {
    await deps.updateEvent(event.id, { status: "APPROVED", isPublished: false });
    return ok({ ok: true, status: "APPROVED", message: "Event unpublished." });
  }
  if (parsedBody.action === "restore") {
    await deps.updateEvent(event.id, { status: "APPROVED", deletedAt: null, deletedReason: null });
    return ok({ ok: true, status: "APPROVED", message: "Event restored." });
  }
  await deps.updateEvent(event.id, { status: "ARCHIVED", isPublished: false, deletedAt: event.deletedAt ?? new Date() });
  return ok({ ok: true, status: "ARCHIVED", message: "Event archived." });
}
