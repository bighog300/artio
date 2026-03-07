import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleDeletePromoCode, handleGetPromoCodes, handlePatchPromoCode, handlePostPromoCode } from "@/lib/promo-code-route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const PROMO_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/my/events/${EVENT_ID}/promo-codes`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDeps(options?: { usedCount?: number; duplicate?: boolean }) {
  let deleted = false;
  let updatedActive: boolean | null = null;

  const promo = {
    id: PROMO_ID,
    code: "OPENING20",
    discountType: "PERCENT" as const,
    value: 20,
    maxUses: 10,
    usedCount: options?.usedCount ?? 0,
    expiresAt: null,
    isActive: true,
  };

  return {
    deps: {
      requireAuth: async () => ({ id: "user-1" }),
      findManagedEventById: async () => ({ id: EVENT_ID }),
      listPromoCodesByEventId: async () => [promo],
      findPromoCodeByCode: async () => (options?.duplicate ? promo : null),
      createPromoCode: async (data: { code: string; discountType: "PERCENT" | "FIXED"; value: number; maxUses: number | null; expiresAt: Date | null }) => ({ ...promo, ...data }),
      findPromoCodeByIdAndEventId: async () => promo,
      updatePromoCode: async (_id: string, data: { isActive?: boolean }) => {
        updatedActive = data.isActive ?? null;
        return { ...promo, ...data };
      },
      deletePromoCode: async () => {
        deleted = true;
      },
    },
    getDeleted: () => deleted,
    getUpdatedActive: () => updatedActive,
  };
}

test("lists promo codes", async () => {
  const { deps } = makeDeps();
  const res = await handleGetPromoCodes(makeRequest("GET"), Promise.resolve({ eventId: EVENT_ID }), deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.promoCodes.length, 1);
});

test("creates promo code and uppercases code", async () => {
  const { deps } = makeDeps();
  const res = await handlePostPromoCode(makeRequest("POST", { code: "opening20", discountType: "PERCENT", value: 20, maxUses: null, expiresAt: null }), Promise.resolve({ eventId: EVENT_ID }), deps);

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.code, "OPENING20");
});

test("returns 409 for duplicate promo code", async () => {
  const { deps } = makeDeps({ duplicate: true });
  const res = await handlePostPromoCode(makeRequest("POST", { code: "opening20", discountType: "PERCENT", value: 20 }), Promise.resolve({ eventId: EVENT_ID }), deps);

  assert.equal(res.status, 409);
});

test("updates mutable fields", async () => {
  const { deps } = makeDeps();
  const res = await handlePatchPromoCode(makeRequest("PATCH", { isActive: false, maxUses: 20, expiresAt: null }), Promise.resolve({ eventId: EVENT_ID, cid: PROMO_ID }), deps);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isActive, false);
});

test("soft-deletes promo code when used", async () => {
  const { deps, getDeleted, getUpdatedActive } = makeDeps({ usedCount: 3 });
  const res = await handleDeletePromoCode(makeRequest("DELETE"), Promise.resolve({ eventId: EVENT_ID, cid: PROMO_ID }), deps);

  assert.equal(res.status, 200);
  assert.equal(getDeleted(), false);
  assert.equal(getUpdatedActive(), false);
});

test("hard-deletes promo code when unused", async () => {
  const { deps, getDeleted, getUpdatedActive } = makeDeps({ usedCount: 0 });
  const res = await handleDeletePromoCode(makeRequest("DELETE"), Promise.resolve({ eventId: EVENT_ID, cid: PROMO_ID }), deps);

  assert.equal(res.status, 200);
  assert.equal(getDeleted(), true);
  assert.equal(getUpdatedActive(), null);
});
