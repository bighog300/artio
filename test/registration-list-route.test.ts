import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  handleGetMyEventRegistrations,
  handleGetMyEventRegistrationsCsv,
  handlePostMyEventRegistrationCancel,
} from "@/lib/registration-list-route";

const EVENT_ID = "event-1";

function makeDeps() {
  const notifications: Array<Record<string, unknown>> = [];
  const rows = [
    {
      id: "reg-1",
      confirmationCode: "AP-AAA111",
      guestName: "Jane",
      guestEmail: "jane@example.com",
      tierId: "tier-1",
      tierName: "General",
      status: "CONFIRMED" as const,
      quantity: 2,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    },
  ];

  return {
    notifications,
    deps: {
      requireAuth: async () => ({ id: "user-1" }),
      hasEventVenueMembership: async () => true,
      findEventById: async () => ({ id: EVENT_ID, title: "Spring Open", slug: "spring-open" }),
      listRegistrations: async () => rows,
      countRegistrations: async () => 1,
      summarizeRegistrations: async () => ({ confirmed: 1, waitlisted: 0, cancelled: 0 }),
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
            findUnique: async () => ({ id: "reg-1", eventId: EVENT_ID, tierId: null, guestEmail: "jane@example.com", confirmationCode: "AP-AAA111", status: "CONFIRMED" }),
            update: async (args) => ({ id: "reg-1", eventId: EVENT_ID, tierId: null, guestEmail: "jane@example.com", confirmationCode: "AP-AAA111", status: args.data.status }),
            count: async () => 1,
            findFirst: async () => null,
          },
        }),
      },
      enqueueNotification: async (payload: Record<string, unknown>) => {
        notifications.push(payload);
        return null;
      },
    },
  };
}

test("GET registrations returns pagination and summary", async () => {
  const { deps } = makeDeps();
  const req = new NextRequest("http://localhost/api/my/events/event-1/registrations?page=1&limit=25");
  const res = await handleGetMyEventRegistrations(req, EVENT_ID, deps);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.items.length, 1);
  assert.equal(body.summary.confirmed, 1);
});

test("GET registrations export returns csv", async () => {
  const { deps } = makeDeps();
  const req = new NextRequest("http://localhost/api/my/events/event-1/registrations/export");
  const res = await handleGetMyEventRegistrationsCsv(req, EVENT_ID, deps);
  const csv = await res.text();

  assert.equal(res.status, 200);
  assert.match(csv, /confirmationCode/);
  assert.match(csv, /AP-AAA111/);
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
});

test("POST organiser cancel cancels and enqueues cancellation", async () => {
  const { deps, notifications } = makeDeps();
  const req = new NextRequest("http://localhost/api/my/events/event-1/registrations/reg-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Venue closure" }),
  });

  const res = await handlePostMyEventRegistrationCancel(req, EVENT_ID, "reg-1", deps);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, "CANCELLED");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.type, "RSVP_CANCELLED");
});
