import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostRegistrationCreate } from "@/lib/registration-create-route";
import { RateLimitError } from "@/lib/rate-limit";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TIER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/events/spring-open/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
    body: JSON.stringify(body),
  });
}

function makeDeps(options?: {
  event?: { ticketingMode?: "EXTERNAL" | "RSVP" | "PAID" | null; capacity?: number | null; rsvpClosesAt?: Date | null } | null;
  aggregateQty?: number;
  userId?: string | null;
  shouldRateLimit?: boolean;
}) {
  let createdStatus: string | null = null;

  const deps = {
    getSessionUser: async () => (options?.userId ? { id: options.userId } : null),
    findPublishedEventBySlug: async () => {
      if (options?.event === null) return null;
      return {
        id: EVENT_ID,
        ticketingMode: options?.event?.ticketingMode ?? "RSVP",
        capacity: options?.event?.capacity ?? 10,
        rsvpClosesAt: options?.event?.rsvpClosesAt ?? null,
      };
    },
    prisma: {
      $transaction: async <T>(fn: (tx: {
        registration: {
          aggregate: (args: { where: { eventId: string; tierId?: string; status: { in: string[] } }; _sum: { quantity: true } }) => Promise<{ _sum: { quantity: number | null } }>;
          create: (args: { data: { status: string }; select: { id: true; confirmationCode: true; status: true } }) => Promise<{ id: string; confirmationCode: string; status: string }>;
        };
        ticketTier: {
          findFirst: () => Promise<{ id: string; eventId: string; capacity: number | null } | null>;
        };
      }) => Promise<T>) => {
        return fn({
          registration: {
            aggregate: async () => ({ _sum: { quantity: options?.aggregateQty ?? 0 } }),
            create: async (args) => {
              createdStatus = args.data.status;
              return { id: "reg-1", confirmationCode: "AP-ABC123", status: args.data.status };
            },
          },
          ticketTier: {
            findFirst: async () => ({ id: TIER_ID, eventId: EVENT_ID, capacity: 2 }),
          },
        });
      },
    },
    enforceRateLimit: async () => {
      if (options?.shouldRateLimit) throw new RateLimitError("Rate limited", 30);
    },
    now: () => new Date("2026-03-01T10:00:00.000Z"),
    generateConfirmationCode: () => "AP-ABC123",
  };

  return { deps, getCreatedStatus: () => createdStatus };
}

test("successful RSVP creation returns 201 with PENDING", async () => {
  const { deps, getCreatedStatus } = makeDeps({ aggregateQty: 3, userId: "user-1" });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "Jane@Example.com", quantity: 2 }), "spring-open", deps);

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.registrationId, "reg-1");
  assert.equal(body.confirmationCode, "AP-ABC123");
  assert.equal(body.status, "PENDING");
  assert.equal(getCreatedStatus(), "PENDING");
});

test("registration is waitlisted when at capacity", async () => {
  const { deps, getCreatedStatus } = makeDeps({ aggregateQty: 10, event: { capacity: 10 } });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "jane@example.com", quantity: 1 }), "spring-open", deps);

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, "WAITLISTED");
  assert.equal(getCreatedStatus(), "WAITLISTED");
});

test("returns 400 when ticketing mode is EXTERNAL", async () => {
  const { deps } = makeDeps({ event: { ticketingMode: "EXTERNAL" } });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 400);
});

test("returns 400 when RSVP is closed", async () => {
  const { deps } = makeDeps({ event: { rsvpClosesAt: new Date("2026-02-01T10:00:00.000Z") } });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 400);
});

test("returns 404 for unknown event", async () => {
  const { deps } = makeDeps({ event: null });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "jane@example.com" }), "missing", deps);

  assert.equal(res.status, 404);
});

test("returns 429 when endpoint is rate limited", async () => {
  const { deps } = makeDeps({ shouldRateLimit: true });
  const res = await handlePostRegistrationCreate(makeRequest({ guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "30");
});
