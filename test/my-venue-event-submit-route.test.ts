import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleVenueEventSubmit } from "../lib/my-venue-event-submit-route.ts";

const venueId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

const completeEvent = {
  id: eventId,
  title: "Gallery Night Opening",
  startAt: new Date("2026-01-01T18:00:00.000Z"),
  endAt: new Date("2026-01-01T20:00:00.000Z"),
  description: "An evening opening featuring new installations and a guided walk-through with participating artists.",
  venueId,
  ticketUrl: "https://tickets.example.com/event",
  isPublished: false,
  images: [{ id: "img-1" }],
};

test("handleVenueEventSubmit returns unauthorized when user is anonymous", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/submit`, { method: "POST" });
  const res = await handleVenueEventSubmit(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => { throw new Error("unauthorized"); },
    requireVenueMembership: async () => undefined,
    findEventForSubmit: async () => completeEvent,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthorized");
});

test("handleVenueEventSubmit returns forbidden when user is not a venue member", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/submit`, { method: "POST" });
  const res = await handleVenueEventSubmit(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    requireVenueMembership: async () => { throw new Error("forbidden"); },
    findEventForSubmit: async () => completeEvent,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});

test("handleVenueEventSubmit returns NOT_READY when event is incomplete", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/submit`, { method: "POST" });
  const res = await handleVenueEventSubmit(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    requireVenueMembership: async () => undefined,
    findEventForSubmit: async () => ({ ...completeEvent, venueId: null }),
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "NOT_READY");
  assert.equal(Array.isArray(body.blocking), true);
  assert.equal(body.blocking.some((item: { id: string }) => item.id === "event-venue"), true);
});

test("handleVenueEventSubmit creates submission when event is complete", async () => {
  let created = false;
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Ready for event review" }),
  });
  const res = await handleVenueEventSubmit(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    requireVenueMembership: async () => undefined,
    findEventForSubmit: async () => completeEvent,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async (input) => {
      created = true;
      assert.equal(input.message, "Ready for event review");
      return { id: "sub-1", status: "IN_REVIEW", createdAt: new Date("2026-01-01T00:00:00.000Z"), submittedAt: new Date() };
    },
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(created, true);
  const body = await res.json();
  assert.equal(body.submission.id, "sub-1");
  assert.equal(body.submission.status, "IN_REVIEW");
});

test("handleVenueEventSubmit returns 409 while pending", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/events/${eventId}/submit`, { method: "POST" });
  const res = await handleVenueEventSubmit(req, Promise.resolve({ venueId, eventId }), {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    requireVenueMembership: async () => undefined,
    findEventForSubmit: async () => completeEvent,
    getLatestSubmissionStatus: async () => "IN_REVIEW",
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });
  assert.equal(res.status, 409);
});
