import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostRegistrationCreate } from "@/lib/registration-create-route";
import { handlePostMyEventRegistrationCancel } from "@/lib/registration-list-route";
import { handleApproveSubmission } from "@/lib/admin-submission-review-route";
import { enqueueReminderSweepWithDb } from "@/lib/outbox-worker";

test("RSVP confirmed enqueue on registration create", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const req = new NextRequest("http://localhost/api/events/spring-open/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
    body: JSON.stringify({ guestName: "Jane", guestEmail: "jane@example.com", quantity: 1 }),
  });

  const res = await handlePostRegistrationCreate(req, "spring-open", {
    getSessionUser: async () => ({ id: "user-1" }),
    findPublishedEventBySlug: async () => ({
      id: "event-1",
      slug: "spring-open",
      title: "Spring Open",
      startAt: new Date("2026-03-02T10:00:00.000Z"),
      ticketingMode: "RSVP",
      capacity: 10,
      rsvpClosesAt: null,
      venue: { name: "Demo Venue", address: "123 Main" },
    }),
    prisma: {
      $transaction: async <T>(fn: (tx: {
        registration: {
          aggregate: () => Promise<{ _sum: { quantity: number | null } }>;
          create: () => Promise<{ id: string; confirmationCode: string; status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" }>;
        };
        ticketTier: { findFirst: () => Promise<null> };
      }) => Promise<T>) => fn({
        registration: {
          aggregate: async () => ({ _sum: { quantity: 0 } }),
          create: async () => ({ id: "reg-1", confirmationCode: "AP-AAA111", status: "PENDING" }),
        },
        ticketTier: { findFirst: async () => null },
      }),
    },
    enforceRateLimit: async () => undefined,
    now: () => new Date("2026-03-01T10:00:00.000Z"),
    generateConfirmationCode: () => "AP-AAA111",
    enqueueNotification: async (payload) => {
      sent.push(payload as Record<string, unknown>);
      return null;
    },
  });

  assert.equal(res.status, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.type, "RSVP_CONFIRMED");
});

test("RSVP cancellation enqueue on organiser cancel", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const req = new NextRequest("http://localhost/api/my/events/event-1/registrations/reg-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Venue closure" }),
  });

  await handlePostMyEventRegistrationCancel(req, "event-1", "reg-1", {
    requireAuth: async () => ({ id: "user-1" }),
    hasEventVenueMembership: async () => true,
    findEventById: async () => ({ id: "event-1", title: "Spring Open", slug: "spring-open" }),
    listRegistrations: async () => [],
    countRegistrations: async () => 0,
    summarizeRegistrations: async () => ({ confirmed: 0, waitlisted: 0, cancelled: 0 }),
    prisma: {
      $transaction: async <T>(fn: (tx: {
        event: {
          findUnique: () => Promise<{ capacity: number | null } | null>;
        };
        registration: {
          findUnique: () => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "CONFIRMED" | "PENDING" | "WAITLISTED" | "CANCELLED" } | null>;
          update: (args: { data: { status: "CANCELLED"; cancelledAt: Date } | { status: "CONFIRMED" } }) => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "CONFIRMED" | "PENDING" | "WAITLISTED" | "CANCELLED" }>;
          count: () => Promise<number>;
          findFirst: () => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "WAITLISTED" } | null>;
        };
      }) => Promise<T>) => fn({
        event: { findUnique: async () => ({ capacity: 1 }) },
        registration: {
          findUnique: async () => ({ id: "reg-1", eventId: "event-1", tierId: null, guestEmail: "jane@example.com", confirmationCode: "AP-AAA111", status: "CONFIRMED" }),
          update: async (args) => ({ id: "reg-1", eventId: "event-1", tierId: null, guestEmail: "jane@example.com", confirmationCode: "AP-AAA111", status: args.data.status }),
          count: async () => 1,
          findFirst: async () => null,
        },
      }),
    },
    enqueueNotification: async (payload) => {
      sent.push(payload as Record<string, unknown>);
      return null;
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.type, "RSVP_CANCELLED");
});

test("event change notify enqueue on revision approval", async () => {
  const sent: Array<{ email: string; dedupeKey: string }> = [];

  const res = await handleApproveSubmission(Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }), {
    requireEditor: async () => ({ id: "editor-1" }),
    findSubmission: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      type: "EVENT",
      kind: "REVISION",
      details: {
        proposed: { title: "Updated Event", slug: "updated-event" },
        baseEventUpdatedAt: "2026-03-01T10:00:00.000Z",
      },
      targetEventId: "22222222-2222-4222-8222-222222222222",
      targetVenueId: null,
      targetArtistId: null,
      status: "IN_REVIEW",
      submitter: { id: "user-1", email: "submitter@example.com" },
      targetVenue: null,
      targetArtist: null,
    }),
    publishVenue: async () => undefined,
    setVenueDraft: async () => undefined,
    publishArtist: async () => undefined,
    setArtistDraft: async () => undefined,
    publishEvent: async () => undefined,
    setEventDraft: async () => undefined,
    findEventUpdatedAt: async () => new Date("2026-03-01T09:00:00.000Z"),
    applyEventRevisionUpdate: async () => undefined,
    markApproved: async () => undefined,
    markNeedsChanges: async () => undefined,
    notifyApproved: async () => undefined,
    listConfirmedRegistrantEmails: async () => ["a@example.com", "b@example.com"],
    enqueueEventChangeNotification: async ({ email, eventId, submissionId }) => {
      sent.push({ email, dedupeKey: `event-change-${eventId}-${submissionId}-${email}` });
    },
  });

  assert.equal(res.status, 200);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.dedupeKey, "event-change-22222222-2222-4222-8222-222222222222-11111111-1111-4111-8111-111111111111-a@example.com");
});

test("24h reminder sweep deduplicates", async () => {
  const outbox = new Map<string, string>();

  const db = {
    siteSettings: { findUnique: async () => ({ emailEnabled: true, emailFromAddress: null, resendApiKey: "x", resendFromAddress: null }) },
    emailUnsubscribe: { findUnique: async () => null },
    event: {
      findMany: async () => [{
        id: "event-1",
        title: "Spring Open",
        slug: "spring-open",
        startAt: new Date("2026-03-02T11:00:00.000Z"),
        venue: { name: "Demo", address: "123 Main" },
      }],
    },
    registration: {
      findMany: async () => [
        { id: "reg-1", guestEmail: "a@example.com" },
        { id: "reg-2", guestEmail: "b@example.com" },
      ],
    },
    notificationOutbox: {
      upsert: async ({ where }: { where: { dedupeKey: string } }) => {
        outbox.set(where.dedupeKey, where.dedupeKey);
        return null;
      },
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
  };

  await enqueueReminderSweepWithDb(db as never, new Date("2026-03-01T11:00:00.000Z"));
  await enqueueReminderSweepWithDb(db as never, new Date("2026-03-01T11:00:00.000Z"));

  assert.equal(outbox.size, 2);
  assert.ok(outbox.has("reminder-24h-event-1-reg-1"));
});
