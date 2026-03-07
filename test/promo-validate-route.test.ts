import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostPromoValidate } from "@/lib/promo-validate-route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TIER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/events/spring-open/validate-promo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeps(options?: { promoCode?: null | { isActive?: boolean; maxUses?: number | null; usedCount?: number; expiresAt?: Date | null } }) {
  return {
    findPublishedEventBySlug: async () => ({ id: EVENT_ID, slug: "spring-open", ticketingMode: "PAID" as const }),
    findTicketTierById: async () => ({ id: TIER_ID, eventId: EVENT_ID, priceAmount: 5000 }),
    findPromoCodeByEventIdAndCode: async () => {
      if (options?.promoCode === null) return null;
      return {
        id: "promo-1",
        discountType: "PERCENT" as const,
        value: 20,
        maxUses: options?.promoCode?.maxUses ?? null,
        usedCount: options?.promoCode?.usedCount ?? 0,
        expiresAt: options?.promoCode?.expiresAt ?? null,
        isActive: options?.promoCode?.isActive ?? true,
      };
    },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

test("valid promo returns discount preview", async () => {
  const res = await handlePostPromoValidate(makeRequest({ promoCode: "opening20", tierId: TIER_ID, quantity: 2 }), "spring-open", makeDeps());

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.valid, true);
  assert.equal(body.discountAmount, 2000);
  assert.equal(body.finalAmount, 8000);
});

test("invalid promo returns 400", async () => {
  const res = await handlePostPromoValidate(makeRequest({ promoCode: "bad", tierId: TIER_ID, quantity: 1 }), "spring-open", makeDeps({ promoCode: null }));

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_invalid");
});

test("expired promo returns 400", async () => {
  const res = await handlePostPromoValidate(
    makeRequest({ promoCode: "old", tierId: TIER_ID, quantity: 1 }),
    "spring-open",
    makeDeps({ promoCode: { expiresAt: new Date("2025-12-31T23:59:59.000Z") } }),
  );

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_expired");
});

test("exhausted promo returns 400", async () => {
  const res = await handlePostPromoValidate(
    makeRequest({ promoCode: "full", tierId: TIER_ID, quantity: 1 }),
    "spring-open",
    makeDeps({ promoCode: { maxUses: 2, usedCount: 2 } }),
  );

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "promo_code_exhausted");
});
