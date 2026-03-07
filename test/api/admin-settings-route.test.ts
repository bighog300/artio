import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminSettingsGet, handleAdminSettingsPatch } from "@/lib/admin-settings-route";

test("GET returns null ingest settings when row has no values", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", { method: "GET" });
  const res = await handleAdminSettingsGet(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    getSiteSettingsFn: async () => ({
      id: "default",
      ingestSystemPrompt: null,
      ingestModel: null,
      ingestMaxOutputTokens: null,
      emailEnabled: false,
      emailFromAddress: null,
      resendApiKey: null,
      resendFromAddress: null,
      emailOutboxBatchSize: null,
    }) as never,
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
    emailOutboxBatchSize: null,
  });
});

test("PATCH updates and returns ingest settings", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ingestSystemPrompt: "custom prompt",
      ingestModel: "gpt-4o",
      ingestMaxOutputTokens: 8000,
      emailEnabled: true,
      emailFromAddress: "Artpulse <noreply@mail.artpulse.co>",
      resendApiKey: "re_test_123",
      resendFromAddress: "Artpulse <noreply@mail.artpulse.co>",
      emailOutboxBatchSize: 50,
    }),
  });

  let captured: Record<string, unknown> | null = null;
  const res = await handleAdminSettingsPatch(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    updateSiteSettingsFn: async (data) => {
      captured = data as Record<string, unknown>;
      return { id: "default", ...data } as never;
    },
  });

  assert.deepEqual(captured, {
    ingestSystemPrompt: "custom prompt",
    ingestModel: "gpt-4o",
    ingestMaxOutputTokens: 8000,
    emailEnabled: true,
    emailFromAddress: "Artpulse <noreply@mail.artpulse.co>",
    resendApiKey: "re_test_123",
    resendFromAddress: "Artpulse <noreply@mail.artpulse.co>",
    emailOutboxBatchSize: 50,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true,
    settings: {
      ingestSystemPrompt: "custom prompt",
      ingestModel: "gpt-4o",
      ingestMaxOutputTokens: 8000,
      emailEnabled: true,
      emailFromAddress: "Artpulse <noreply@mail.artpulse.co>",
      resendApiKey: "re_test_123",
      resendFromAddress: "Artpulse <noreply@mail.artpulse.co>",
      emailOutboxBatchSize: 50,
    },
  });
});

test("PATCH allows clearing ingestSystemPrompt to null", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ingestSystemPrompt: null }),
  });

  const res = await handleAdminSettingsPatch(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
    updateSiteSettingsFn: async (data) => ({
      id: "default",
      ingestSystemPrompt: data.ingestSystemPrompt ?? null,
      ingestModel: null,
      ingestMaxOutputTokens: null,
      emailEnabled: false,
      emailFromAddress: null,
      resendApiKey: null,
      resendFromAddress: null,
      emailOutboxBatchSize: null,
    }) as never,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true,
    settings: {
      ingestSystemPrompt: null,
      ingestModel: null,
      ingestMaxOutputTokens: null,
      emailEnabled: false,
      emailFromAddress: null,
      resendApiKey: null,
      resendFromAddress: null,
      emailOutboxBatchSize: null,
    },
  });
});

test("PATCH returns 400 for invalid body", async () => {
  const req = new NextRequest("http://localhost/api/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ingestMaxOutputTokens: -1 }),
  });

  const res = await handleAdminSettingsPatch(req, {
    requireAdminFn: async () => ({ id: "admin", email: "admin@example.com" }) as never,
  });

  assert.equal(res.status, 400);
});
