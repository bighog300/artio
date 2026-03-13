import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleEventSelfPublish } from "@/lib/my-event-self-publish-route";

const eventId = "11111111-1111-4111-8111-111111111111";

function buildEvent(overrides: Partial<{ venue: { id?: string; status?: string | null; isPublished?: boolean | null } | null; deletedAt: Date | null; isPublished: boolean; startAt: Date | null }> = {}) {
  return {
    id: eventId,
    title: "Open studio",
    startAt: new Date("2026-01-10T20:00:00.000Z"),
    endAt: null,
    venueId: "venue-1",
    timezone: "Europe/London",
    ticketUrl: null,
    isPublished: false,
    deletedAt: null,
    status: "APPROVED",
    venue: { id: "venue-1", status: "PUBLISHED", isPublished: true },
    ...overrides,
  };
}

function createDeps(options?: { trusted?: boolean; canEdit?: boolean; event?: ReturnType<typeof buildEvent> }) {
  let state = options?.event ?? buildEvent();
  const audits: Array<{ action: string; metadata: { isPublished: boolean } }> = [];

  return {
    getState: () => state,
    audits,
    deps: {
      requireAuth: async () => ({
        id: "user-1",
        email: "editor@example.com",
        role: "EDITOR" as const,
        isTrustedPublisher: options?.trusted ?? false,
      }),
      canEditEvent: async () => options?.canEdit ?? true,
      findEventForPublish: async () => state,
      updateEventPublishState: async (_: string, isPublished: boolean) => {
        state = { ...state, isPublished };
        return state;
      },
      logAdminAction: async (input: { action: string; metadata: { isPublished: boolean } }) => {
        audits.push({ action: input.action, metadata: input.metadata });
      },
    },
  };
}

test("trusted publisher can publish a ready event", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, getState, audits } = createDeps({ trusted: true });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: true }, deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.isPublished, true);
  assert.equal(getState().isPublished, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "EVENT_SELF_PUBLISH_TOGGLED");
  assert.equal(audits[0]?.metadata.isPublished, true);
});

test("trusted publisher can unpublish a published event", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, getState, audits } = createDeps({ trusted: true, event: buildEvent({ isPublished: true }) });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: false }, deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.isPublished, false);
  assert.equal(getState().isPublished, false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "EVENT_SELF_PUBLISH_TOGGLED");
  assert.equal(audits[0]?.metadata.isPublished, false);
});

test("regular venue editor (non-trusted) can unpublish a published event", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, getState, audits } = createDeps({ trusted: false, event: buildEvent({ isPublished: true }) });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: false }, deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.isPublished, false);
  assert.equal(getState().isPublished, false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "EVENT_SELF_PUBLISH_TOGGLED");
  assert.equal(audits[0]?.metadata.isPublished, false);
});

test("regular venue editor cannot directly publish", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, audits } = createDeps({ trusted: false });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: true }, deps);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
  assert.equal(audits.length, 0);
});

test("blocked publish when startAt is missing", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, audits } = createDeps({ trusted: true, event: buildEvent({ startAt: null }) });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: true }, deps);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "publish_blocked");
  assert.equal(Array.isArray(body.blockers), true);
  assert.equal(body.blockers.some((item: { id: string }) => item.id === "event-start"), true);
  assert.equal(audits.length, 0);
});

test("non-member gets 403", async () => {
  const req = new NextRequest(`http://localhost/api/my/events/${eventId}/publish`, { method: "POST" });
  const { deps, audits } = createDeps({ trusted: true, canEdit: false });

  const res = await handleEventSelfPublish(req, { eventId, isPublished: true }, deps);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
  assert.equal(audits.length, 0);
});
