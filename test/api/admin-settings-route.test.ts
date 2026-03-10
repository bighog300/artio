import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminSettingsGet, handleAdminSettingsPatch } from "@/lib/admin-settings-route";

function baseSettings() {
  return {
    id: "default",
    ingestSystemPrompt: null,
    ingestModel: null,
    ingestMaxOutputTokens: null,
    emailEnabled: false,
    emailFromAddress: null,
    resendApiKey: null,
    resendFromAddress: null,
    stripePublishableKey: null,
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    platformFeePercent: 5,
    emailOutboxBatchSize: null,
    analyticsSalt: null,
    openAiApiKey: null,
    googlePseApiKey: null,
    braveSearchApiKey: null,
    googlePseCx: null,
    ingestEnabled: false,
    ingestMaxCandidatesPerVenueRun: null,
    ingestDuplicateSimilarityThreshold: null,
    ingestDuplicateLookbackDays: null,
    ingestConfidenceHighMin: null,
    ingestConfidenceMediumMin: null,
    ingestImageEnabled: true,
    venueGenerationModel: null,
    venueAutoPublish: false,
    editorialNotifyTo: null,
    editorialNotificationsWebhookUrl: null,
    editorialNotificationsEmailEnabled: false,
    alertWebhookUrl: null,
    alertWebhookSecret: null,
    googleIndexingEnabled: false,
    googleServiceAccountJson: null,
  };
}

test("GET returns null ingest settings when row has no values", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", { method: "GET" });
  const res = await handleAdminSettingsGet(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    getSiteSettingsFn: async () => baseSettings() as never,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ingestSystemPrompt: null,
    ingestModel: null,
    ingestMaxOutputTokens: null,
    emailEnabled: false,
    emailFromAddress: null,
    resendApiKey: null,
    resendFromAddress: null,
    stripePublishableKey: null,
    stripeSecretKeySet: false,
    stripeWebhookSecretSet: false,
    platformFeePercent: 5,
    emailOutboxBatchSize: null,
    analyticsSalt: null,
    openAiApiKeySet: false,
    geminiApiKeySet: false,
    anthropicApiKeySet: false,
    googlePseApiKeySet: false,
    braveSearchApiKeySet: false,
    googlePseCx: null,
    ingestEnabled: false,
    ingestMaxCandidatesPerVenueRun: null,
    ingestDuplicateSimilarityThreshold: null,
    ingestDuplicateLookbackDays: null,
    ingestConfidenceHighMin: null,
    ingestConfidenceMediumMin: null,
    ingestImageEnabled: true,
    venueGenerationModel: null,
    venueAutoPublish: false,
    editorialNotifyTo: null,
    editorialNotificationsWebhookUrl: null,
    editorialNotificationsEmailEnabled: false,
    alertWebhookUrl: null,
    alertWebhookSecretSet: false,
    googleIndexingEnabled: false,
    googleServiceAccountJsonSet: false,
  });
});

test("GET returns openAiApiKeySet boolean, not raw key", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", { method: "GET" });
  const res = await handleAdminSettingsGet(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    getSiteSettingsFn: async () => ({ ...baseSettings(), openAiApiKey: "sk-secret" }) as never,
  });

  const payload = await res.json() as Record<string, unknown>;
  assert.equal(res.status, 200);
  assert.equal(payload.openAiApiKeySet, true);
  assert.equal(payload.openAiApiKey, undefined);
});

test("GET returns alertWebhookSecretSet boolean, not raw secret", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", { method: "GET" });
  const res = await handleAdminSettingsGet(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    getSiteSettingsFn: async () => ({ ...baseSettings(), alertWebhookSecret: "super-secret" }) as never,
  });

  const payload = await res.json() as Record<string, unknown>;
  assert.equal(res.status, 200);
  assert.equal(payload.alertWebhookSecretSet, true);
  assert.equal(payload.alertWebhookSecret, undefined);
});

test("PATCH persists all 16 new fields", async () => {
  const body = {
    analyticsSalt: "salt",
    openAiApiKey: "sk-key",
    ingestEnabled: true,
    ingestMaxCandidatesPerVenueRun: 50,
    ingestDuplicateSimilarityThreshold: 90,
    ingestDuplicateLookbackDays: 14,
    ingestConfidenceHighMin: 80,
    ingestConfidenceMediumMin: 60,
    ingestImageEnabled: false,
    venueGenerationModel: "gpt-4.1-mini",
    venueAutoPublish: true,
    editorialNotifyTo: "ops@example.com",
    editorialNotificationsWebhookUrl: "https://example.com/editorial",
    editorialNotificationsEmailEnabled: true,
    alertWebhookUrl: "https://example.com/alerts",
    alertWebhookSecret: "secret",
  };

  const req = new NextRequest("http://localhost/api/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  let captured: Record<string, unknown> | null = null;
  const res = await handleAdminSettingsPatch(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    updateSiteSettingsFn: async (data) => {
      captured = data as Record<string, unknown>;
      return { ...baseSettings(), ...data } as never;
    },
  });

  assert.deepEqual(captured, body);
  assert.equal(res.status, 200);
  const json = await res.json() as { settings: Record<string, unknown> };
  assert.equal(json.settings.openAiApiKeySet, true);
  assert.equal(json.settings.alertWebhookSecretSet, true);
  assert.equal(json.settings.analyticsSalt, "salt");
  assert.equal(json.settings.ingestEnabled, true);
});

test("PATCH with ingestDuplicateSimilarityThreshold outside 0–100 returns 400", async () => {
  for (const ingestDuplicateSimilarityThreshold of [-1, 101]) {
    const req = new NextRequest("http://localhost/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingestDuplicateSimilarityThreshold }),
    });

    const res = await handleAdminSettingsPatch(req, {
      requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    });

    assert.equal(res.status, 400);
  }
});

test("PATCH with ingestConfidenceHighMin less than ingestConfidenceMediumMin returns 400", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ingestConfidenceHighMin: 40, ingestConfidenceMediumMin: 60 }),
  });

  const res = await handleAdminSettingsPatch(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
  });

  assert.equal(res.status, 400);
});
