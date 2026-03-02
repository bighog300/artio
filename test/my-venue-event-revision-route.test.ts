import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleCreateEventRevision } from "../lib/my-venue-event-revision-route.ts";

const venueId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

const publishedEvent = {
  id: eventId,
  title: "Gallery Night Opening",
  description: "An evening opening featuring new installations and a guided walk-through with participating artists.",
  startAt: new Date("2026-01-01T18:00:00.000Z"),
  endAt: null,
  ticketUrl: null,
  isPublished: true,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("handleCreateEventRevision returns unauthorized for anonymous users", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: { title: "New" } }) });
  const res = await handleCreateEventRevision(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => { throw new Error("unauthorized"); },
    requireVenueMembership: async () => undefined,
    findEvent: async () => publishedEvent,
    createRevisionSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), decisionReason: null, decidedAt: null }),
    getLatestRevision: async () => null,
  });
  assert.equal(res.status, 401);
});

test("handleCreateEventRevision returns forbidden for non-members", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: { title: "New" } }) });
  const res = await handleCreateEventRevision(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "u1", email: "u@example.com" }),
    requireVenueMembership: async () => { throw new Error("forbidden"); },
    findEvent: async () => publishedEvent,
    createRevisionSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), decisionReason: null, decidedAt: null }),
    getLatestRevision: async () => null,
  });
  assert.equal(res.status, 403);
});

test("handleCreateEventRevision returns invalid_request for empty patch", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: {} }) });
  const res = await handleCreateEventRevision(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "u1", email: "u@example.com" }),
    requireVenueMembership: async () => undefined,
    findEvent: async () => publishedEvent,
    createRevisionSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), decisionReason: null, decidedAt: null }),
    getLatestRevision: async () => null,
  });
  assert.equal(res.status, 400);
});

test("handleCreateEventRevision creates revision submission", async () => {
  let created = false;
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: { title: "Updated title" }, message: "Fix typo" }) });
  const res = await handleCreateEventRevision(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "u1", email: "u@example.com" }),
    requireVenueMembership: async () => undefined,
    findEvent: async () => publishedEvent,
    createRevisionSubmission: async (input) => {
      created = true;
      assert.equal(input.proposed.title, "Updated title");
      return { id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), decisionReason: null, decidedAt: null };
    },
    getLatestRevision: async () => null,
  });
  assert.equal(res.status, 200);
  assert.equal(created, true);
});
