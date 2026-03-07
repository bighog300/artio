import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostCheckoutSession } from "@/lib/checkout-session-route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TIER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/events/spring-open/checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeps(options?: {
  event?: { ticketingMode?: "EXTERNAL" | "RSVP" | "PAID" | null; venueId?: string | null } | null;
  tier?: { eventId?: string; isActive?: boolean; priceAmount?: number } | null;
  stripeAccount?: { status?: "PENDING" | "ACTIVE" | "RESTRICTED" | "DEAUTHORIZED"; chargesEnabled?: boolean } | null;
  platformFeePercent?: number;
  promoCode?: null | { isActive?: boolean; maxUses?: number | null; usedCount?: number; expiresAt?: Date | null; discountType?: "PERCENT" | "FIXED"; value?: number };
}) {
  let capturedApplicationFeeAmount: number | null = null;
  let capturedUnitAmount: number | null = null;
  let capturedIncrementBy: number | null = null;

  const deps: Parameters<typeof handlePostCheckoutSession>[2] = {
    getSessionUser: async () => ({ id: "user-1" }),
    findPublishedEventBySlug: async () => {
      if (options?.event === null) return null;
      return {
        id: EVENT_ID,
        slug: "spring-open",
        title: "Spring Open",
        venueId: options?.event?.venueId ?? "venue-1",
        ticketingMode: options?.event?.ticketingMode ?? "PAID",
      };
    },
    findTicketTierById: async () => {
      if (options?.tier === null) return null;
      return {
        id: TIER_ID,
        eventId: options?.tier?.eventId ?? EVENT_ID,
        name: "General Admission",
        priceAmount: options?.tier?.priceAmount ?? 2500,
        currency: "GBP",
        isActive: options?.tier?.isActive ?? true,
      };
    },
    findStripeAccountByVenueId: async () => {
      if (options?.stripeAccount === null) return null;
      return {
        stripeAccountId: "acct_123",
        status: options?.stripeAccount?.status ?? "ACTIVE",
        chargesEnabled: options?.stripeAccount?.chargesEnabled ?? true,
      };
    },
    findPromoCodeByEventIdAndCode: async () => {
      if (options?.promoCode === null) return null;
      return {
        id: "promo-1",
        discountType: options?.promoCode?.discountType ?? "PERCENT",
        value: options?.promoCode?.value ?? 20,
        maxUses: options?.promoCode?.maxUses ?? null,
        usedCount: options?.promoCode?.usedCount ?? 0,
        expiresAt: options?.promoCode?.expiresAt ?? null,
        isActive: options?.promoCode?.isActive ?? true,
      };
    },
    getPlatformFeePercent: async () => options?.platformFeePercent ?? 5,
    createRegistrationWithPromo: async (data) => {
      capturedIncrementBy = data.incrementPromoCodeUsageBy;
      return { id: "reg-1", confirmationCode: "AP-ABC123" };
    },
    createCheckoutSession: async (params) => {
      capturedApplicationFeeAmount = params.application_fee_amount;
      capturedUnitAmount = params.line_items[0]?.price_data.unit_amount ?? null;
      return { id: "cs_123", url: "https://checkout.stripe.com/c/pay/cs_123" };
    },
    generateConfirmationCode: () => "AP-ABC123",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };

  return {
    deps,
    getApplicationFeeAmount: () => capturedApplicationFeeAmount,
    getUnitAmount: () => capturedUnitAmount,
    getIncrementBy: () => capturedIncrementBy,
  };
}

test("successful session creation returns checkout URL", async () => {
  const { deps } = makeDeps();
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, quantity: 2, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.sessionId, "cs_123");
  assert.equal(body.url, "https://checkout.stripe.com/c/pay/cs_123");
});

test("returns 400 when event ticketing mode is not PAID", async () => {
  const { deps } = makeDeps({ event: { ticketingMode: "RSVP" } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 400);
});

test("returns 400 when no active stripe account", async () => {
  const { deps } = makeDeps({ stripeAccount: { status: "RESTRICTED", chargesEnabled: false } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 400);
});

test("returns 404 for unknown event", async () => {
  const { deps } = makeDeps({ event: null });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com" }), "missing", deps);

  assert.equal(res.status, 404);
});

test("returns 404 for unknown tier", async () => {
  const { deps } = makeDeps({ tier: null });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 404);
});

test("returns 400 for free tier", async () => {
  const { deps } = makeDeps({ tier: { priceAmount: 0 } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 400);
});

test("platform fee amount is rounded from total", async () => {
  const { deps, getApplicationFeeAmount } = makeDeps({ platformFeePercent: 7 });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, quantity: 3, guestName: "Jane", guestEmail: "jane@example.com" }), "spring-open", deps);

  assert.equal(res.status, 201);
  assert.equal(getApplicationFeeAmount(), 525);
});

test("valid promo applies discount", async () => {
  const { deps, getApplicationFeeAmount, getUnitAmount } = makeDeps({ promoCode: { discountType: "PERCENT", value: 20 } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, quantity: 2, guestName: "Jane", guestEmail: "jane@example.com", promoCode: "opening20" }), "spring-open", deps);

  assert.equal(res.status, 201);
  assert.equal(getUnitAmount(), 2000);
  assert.equal(getApplicationFeeAmount(), 200);
});

test("expired promo returns 400", async () => {
  const { deps } = makeDeps({ promoCode: { expiresAt: new Date("2025-12-31T23:59:59.000Z") } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com", promoCode: "old" }), "spring-open", deps);

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_expired");
});

test("exhausted promo returns 400", async () => {
  const { deps } = makeDeps({ promoCode: { maxUses: 2, usedCount: 2 } });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com", promoCode: "full" }), "spring-open", deps);

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_exhausted");
});

test("invalid promo returns 400", async () => {
  const { deps } = makeDeps({ promoCode: null });
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, guestName: "Jane", guestEmail: "jane@example.com", promoCode: "bad" }), "spring-open", deps);

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_invalid");
});

test("usedCount incremented by quantity when promo applied", async () => {
  const { deps, getIncrementBy } = makeDeps();
  const res = await handlePostCheckoutSession(makeRequest({ tierId: TIER_ID, quantity: 3, guestName: "Jane", guestEmail: "jane@example.com", promoCode: "OPENING20" }), "spring-open", deps);

  assert.equal(res.status, 201);
  assert.equal(getIncrementBy(), 3);
});
