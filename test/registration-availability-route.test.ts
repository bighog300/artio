import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleGetRegistrationAvailability } from "@/lib/registration-availability-route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TIER_GENERAL = "22222222-2222-4222-8222-222222222222";
const TIER_VIP = "33333333-3333-4333-8333-333333333333";

function makeRequest() {
  return new NextRequest("http://localhost/api/events/spring-open/availability", { method: "GET" });
}

function makeDeps(options?: {
  event?: { capacity?: number | null; rsvpClosesAt?: Date | null } | null;
  eventRegistered?: number;
  tiers?: Array<{ id: string; name: string; capacity: number | null; priceAmount: number; currency: string; sortOrder: number }>;
  tierRegisteredById?: Record<string, number>;
  now?: Date;
}) {
  return {
    findPublishedEventBySlug: async () => {
      if (options?.event === null) return null;
      return {
        id: EVENT_ID,
        capacity: options?.event?.capacity === undefined ? 100 : options.event.capacity,
        rsvpClosesAt: options?.event?.rsvpClosesAt === undefined ? null : options.event.rsvpClosesAt,
      };
    },
    prisma: {
      registration: {
        aggregate: async (args: { where: { eventId: string; tierId?: string; status: { in: string[] } }; _sum: { quantity: true } }) => {
          if (args.where.tierId) {
            return { _sum: { quantity: options?.tierRegisteredById?.[args.where.tierId] ?? 0 } };
          }
          return { _sum: { quantity: options?.eventRegistered ?? 0 } };
        },
      },
      ticketTier: {
        findMany: async () => options?.tiers ?? [],
      },
    },
    now: () => options?.now ?? new Date("2026-03-01T10:00:00.000Z"),

    unstableCache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
}

test("unlimited capacity event returns null available", async () => {
  const deps = makeDeps({ event: { capacity: null }, eventRegistered: 42 });
  const res = await handleGetRegistrationAvailability(makeRequest(), "spring-open", deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.capacity, null);
  assert.equal(body.registered, 42);
  assert.equal(body.available, null);
  assert.equal(body.isSoldOut, false);
});

test("capacity event returns correct available count", async () => {
  const deps = makeDeps({ event: { capacity: 100 }, eventRegistered: 42 });
  const res = await handleGetRegistrationAvailability(makeRequest(), "spring-open", deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.available, 58);
  assert.equal(body.isSoldOut, false);
});

test("sold-out event marks isSoldOut true", async () => {
  const deps = makeDeps({ event: { capacity: 50 }, eventRegistered: 50 });
  const res = await handleGetRegistrationAvailability(makeRequest(), "spring-open", deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.available, 0);
  assert.equal(body.isSoldOut, true);
});

test("event with closed RSVP marks isRsvpClosed true", async () => {
  const deps = makeDeps({
    event: { capacity: 50, rsvpClosesAt: new Date("2026-03-01T09:59:59.000Z") },
    eventRegistered: 10,
    now: new Date("2026-03-01T10:00:00.000Z"),
  });
  const res = await handleGetRegistrationAvailability(makeRequest(), "spring-open", deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isRsvpClosed, true);
});

test("per-tier availability is returned for active tiers", async () => {
  const deps = makeDeps({
    tiers: [
      { id: TIER_GENERAL, name: "General Admission", capacity: 80, priceAmount: 0, currency: "GBP", sortOrder: 0 },
      { id: TIER_VIP, name: "VIP", capacity: null, priceAmount: 2500, currency: "GBP", sortOrder: 1 },
    ],
    tierRegisteredById: {
      [TIER_GENERAL]: 30,
      [TIER_VIP]: 5,
    },
  });
  const res = await handleGetRegistrationAvailability(makeRequest(), "spring-open", deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.tiers.length, 2);
  assert.deepEqual(body.tiers[0], {
    id: TIER_GENERAL,
    name: "General Admission",
    capacity: 80,
    registered: 30,
    available: 50,
    priceAmount: 0,
    currency: "GBP",
    sortOrder: 0,
  });
  assert.deepEqual(body.tiers[1], {
    id: TIER_VIP,
    name: "VIP",
    capacity: null,
    registered: 5,
    available: null,
    priceAmount: 2500,
    currency: "GBP",
    sortOrder: 1,
  });
});

test("returns 404 for unknown event", async () => {
  const deps = makeDeps({ event: null });
  const res = await handleGetRegistrationAvailability(makeRequest(), "missing", deps);

  assert.equal(res.status, 404);
});
