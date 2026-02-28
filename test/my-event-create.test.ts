import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostMyEvent } from "@/lib/my-event-create-route";

test("initial create creates draft event + submission + audit entry", async () => {
  const events: Array<{ id: string; title: string; slug: string; startAt: Date; endAt: Date | null; venueId: string | null; isPublished: boolean }> = [];
  const submissions: Array<{ eventId: string; status: string }> = [];
  const audits: Array<{ action: string; reused: boolean }> = [];

  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Spring Gala", startAt: "2026-01-01T10:00:00.000Z", endAt: "2026-01-01T12:00:00.000Z", venueId: "11111111-1111-4111-8111-111111111111" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1", email: "owner@example.com" }),
    listManagedVenues: async () => [{ id: "11111111-1111-4111-8111-111111111111", role: "OWNER" }],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async (input) => {
      const created = { id: "event-1", slug: input.slug, title: input.title, startAt: input.startAt, endAt: input.endAt, venueId: input.venueId, isPublished: false };
      events.push(created);
      return created;
    },
    upsertEventDraftSubmission: async (eventId) => { submissions.push({ eventId, status: "DRAFT" }); },
    setOnboardingFlag: async () => undefined,
    logAudit: async ({ action, reused }) => { audits.push({ action, reused }); },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.created, true);
  assert.equal(events.length, 1);
  assert.equal(submissions[0]?.eventId, "event-1");
  assert.deepEqual(audits[0], { action: "EVENT_CREATED_SELF_SERVE", reused: false });
});

test("idempotency returns same event with created=false", async () => {
  const existing = { id: "event-existing", slug: "spring-gala", title: "Spring Gala", startAt: new Date("2026-01-01T10:00:00.000Z"), endAt: null, venueId: "11111111-1111-4111-8111-111111111111", isPublished: false };
  let createCalls = 0;

  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Spring Gala", startAt: "2026-01-01T10:00:00.000Z", venueId: "11111111-1111-4111-8111-111111111111" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [{ id: "11111111-1111-4111-8111-111111111111", role: "EDITOR" }],
    findExistingDraftByCreateKey: async () => existing,
    findEventBySlug: async () => null,
    createEvent: async () => {
      createCalls += 1;
      return existing;
    },
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.created, false);
  assert.equal(body.event.id, "event-existing");
  assert.equal(createCalls, 0);
});

test("venue role enforcement when venueId provided", async () => {
  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Secure", startAt: "2026-01-01T10:00:00.000Z", venueId: "11111111-1111-4111-8111-111111111111" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [{ id: "22222222-2222-4222-8222-222222222222", role: "EDITOR" }],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async () => ({ id: "event-1", slug: "secure", title: "Secure", startAt: new Date(), endAt: null, venueId: null, isPublished: false }),
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 403);
});

test("allows 0 venues behavior by creating draft without venue", async () => {
  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "No Venue Draft", startAt: "2026-01-01T10:00:00.000Z" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async (input) => ({ id: "event-1", slug: "no-venue-draft", title: input.title, startAt: input.startAt, endAt: input.endAt, venueId: input.venueId, isPublished: false }),
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.missingVenue, true);
  assert.equal(body.event.venueId, null);
});

test("validates end before start", async () => {
  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Invalid", startAt: "2026-01-01T10:00:00.000Z", endAt: "2026-01-01T09:00:00.000Z" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async () => ({ id: "event-1", slug: "invalid", title: "Invalid", startAt: new Date(), endAt: null, venueId: null, isPublished: false }),
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 400);
});

test("unauthenticated request returns 401", async () => {
  const req = new NextRequest("http://localhost/api/my/events", { method: "POST" });
  const res = await handlePostMyEvent(req, {
    requireAuth: async () => { throw new Error("unauthorized"); },
    listManagedVenues: async () => [],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async () => ({ id: "event-1", slug: "x", title: "X", startAt: new Date(), endAt: null, venueId: null, isPublished: false }),
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 401);
});

test("onboarding wrapper is called safely", async () => {
  let onboardingCalls = 0;
  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Onboarding", startAt: "2026-01-01T10:00:00.000Z" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async (input) => ({ id: "event-1", slug: "onboarding", title: input.title, startAt: input.startAt, endAt: input.endAt, venueId: input.venueId, isPublished: false }),
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => { onboardingCalls += 1; },
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(onboardingCalls, 1);
});


test("create event persists eventType", async () => {
  let createdEventType = "";
  const req = new NextRequest("http://localhost/api/my/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Typed", startAt: "2026-01-01T10:00:00.000Z", eventType: "WORKSHOP" }),
  });

  const res = await handlePostMyEvent(req, {
    requireAuth: async () => ({ id: "user-1" }),
    listManagedVenues: async () => [],
    findExistingDraftByCreateKey: async () => null,
    findEventBySlug: async () => null,
    createEvent: async (input) => {
      createdEventType = input.eventType;
      return { id: "event-1", slug: "typed", title: input.title, startAt: input.startAt, endAt: input.endAt, venueId: input.venueId, isPublished: false };
    },
    upsertEventDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(createdEventType, "WORKSHOP");
});
