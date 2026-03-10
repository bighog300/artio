import test from "node:test";
import assert from "node:assert/strict";
import { handleStripeWebhook } from "@/lib/stripe-webhook-handler";

function makeRequest(payload: unknown, signature = "t=1,v1=abc") {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: JSON.stringify(payload),
  });
}

function makeDeps(overrides?: Partial<Parameters<typeof handleStripeWebhook>[1]>) {
  let updatedStripeStatus: string | null = null;
  let registrationStatus: string | null = null;
  let notificationType: string | null = null;

  const deps: Parameters<typeof handleStripeWebhook>[1] = {
    getWebhookSecret: async () => "whsec_test_123",
    constructEvent: (_payload, _sig, _secret) => ({ type: "unhandled", data: { object: {} } }),
    findStripeAccountByStripeAccountId: async () => ({ id: "sa-1" }),
    updateStripeAccount: async (_id, data) => { updatedStripeStatus = data.status; },
    findArtistStripeAccountByStripeAccountId: async () => null,
    updateArtistStripeAccount: async () => {},
    findRegistrationByPaymentIntentId: async () => ({ id: "reg-1", status: "PENDING" }),
    findRegistrationById: async () => ({ id: "reg-1", status: "PENDING" }),
    updateRegistrationStatus: async (_id, status) => { registrationStatus = status; },
    findArtworkOrderBySessionId: async () => null,
    confirmArtworkOrder: async () => {},
    enqueueNotification: async ({ type }) => { notificationType = type; },
    ...overrides,
  };

  return {
    deps,
    getStripeStatus: () => updatedStripeStatus,
    getRegistrationStatus: () => registrationStatus,
    getNotificationType: () => notificationType,
  };
}

test("signature failure returns 400", async () => {
  const { deps } = makeDeps({
    constructEvent: () => {
      throw new Error("bad signature");
    },
  });

  const res = await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(res.status, 400);
});

test("account.updated sets ACTIVE", async () => {
  const { deps, getStripeStatus } = makeDeps({
    constructEvent: () => ({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, deleted: false } },
    }),
  });

  const res = await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(res.status, 200);
  assert.equal(getStripeStatus(), "ACTIVE");
});

test("account.updated sets RESTRICTED when charges disabled", async () => {
  const { deps, getStripeStatus } = makeDeps({
    constructEvent: () => ({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: false, payouts_enabled: true, deleted: false } },
    }),
  });

  await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(getStripeStatus(), "RESTRICTED");
});

test("checkout.session.completed confirms registration and enqueues email", async () => {
  const { deps, getRegistrationStatus, getNotificationType } = makeDeps({
    constructEvent: () => ({
      type: "checkout.session.completed",
      data: { object: { payment_intent: "pi_123", metadata: { registrationId: "reg_123" } } },
    }),
  });

  await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(getRegistrationStatus(), "CONFIRMED");
  assert.equal(getNotificationType(), "REGISTRATION_CONFIRMED");
});

test("account.application.deauthorized sets DEAUTHORIZED", async () => {
  const { deps, getStripeStatus } = makeDeps({
    constructEvent: () => ({
      type: "account.application.deauthorized",
      data: { object: { id: "acct_1" } },
    }),
  });

  await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(getStripeStatus(), "DEAUTHORIZED");
});

test("unhandled event returns 200", async () => {
  const { deps } = makeDeps({
    constructEvent: () => ({ type: "customer.created", data: { object: { id: "cus_1" } } }),
  });

  const res = await handleStripeWebhook(makeRequest({}), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { received: true });
});
