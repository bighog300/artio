import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  handleAdminBrandingLogoClear,
  handleAdminBrandingLogoCommit,
  handleAdminBrandingLogoGet,
  handleAdminBrandingLogoUpload,
} from "../lib/admin-branding-logo-route";

test("POST /api/admin/branding/logo/upload returns 403 for non-admin", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "upload", payload: "{}" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoUpload(req, {
    requireAdminUser: async () => {
      throw new Error("forbidden");
    },
    handleUploadFn: async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken("logo", JSON.stringify({ filename: "logo.png", contentType: "image/png", size: 1024 }));
      return { ok: true } as never;
    },
  });

  assert.equal(res.status, 403);
});

test("POST /api/admin/branding/logo/upload returns 400 for invalid payload", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "upload", payload: JSON.stringify({ filename: "bad.svg", contentType: "image/svg+xml", size: 10 }) }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoUpload(req, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    handleUploadFn: async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken("logo", JSON.stringify({ filename: "bad.svg", contentType: "image/svg+xml", size: 10 }));
      return { ok: true } as never;
    },
  });

  assert.equal(res.status, 400);
});

test("POST /api/admin/branding/logo/upload succeeds for valid payload", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "upload", payload: "{}" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoUpload(req, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    handleUploadFn: async ({ onBeforeGenerateToken }) => {
      const token = await onBeforeGenerateToken("logo", JSON.stringify({ filename: "logo.png", contentType: "image/png", size: 1024 }));
      assert.equal(token.maximumSizeInBytes, 2_000_000);
      return { url: "https://example.com/upload" } as never;
    },
  });

  assert.equal(res.status, 200);
});

test("POST /api/admin/branding/logo/commit returns 400 for invalid body", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/commit", {
    method: "POST",
    body: JSON.stringify({ blobUrl: "not-a-url" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoCommit(req, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  });

  assert.equal(res.status, 400);
});

test("POST /api/admin/branding/logo/commit creates asset and updates settings", async () => {
  const state: { asset: null | { id: string; url: string }; settingsLogoAssetId: string | null } = { asset: null, settingsLogoAssetId: null };

  const req = new NextRequest("http://localhost/api/admin/branding/logo/commit", {
    method: "POST",
    body: JSON.stringify({
      blobUrl: "https://blob.vercel-storage.com/logo.png",
      blobPath: "uploads/logo.png",
      contentType: "image/png",
      size: 1234,
    }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoCommit(req, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    appDb: {
      asset: {
        create: async ({ data }: { data: { url: string } }) => {
          state.asset = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: data.url };
          return { id: state.asset.id, url: state.asset.url };
        },
      },
      siteSettings: {
        upsert: async ({ update }: { update: { logoAssetId: string } }) => {
          state.settingsLogoAssetId = update.logoAssetId;
          return { id: "default", logoAssetId: update.logoAssetId };
        },
      },
    } as never,
  });

  assert.equal(res.status, 200);
  assert.equal(state.asset?.url, "https://blob.vercel-storage.com/logo.png");
  assert.equal(state.settingsLogoAssetId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});


test("POST /api/admin/branding/logo/commit returns 403 for non-admin", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/commit", {
    method: "POST",
    body: JSON.stringify({
      blobUrl: "https://blob.vercel-storage.com/logo.png",
      blobPath: "uploads/logo.png",
      contentType: "image/png",
      size: 1234,
    }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminBrandingLogoCommit(req, {
    requireAdminUser: async () => { throw new Error("forbidden"); },
  });

  assert.equal(res.status, 403);
});
test("POST /api/admin/branding/logo/clear resets persisted logo", async () => {
  let settingsLogoAssetId: string | null = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const req = new NextRequest("http://localhost/api/admin/branding/logo/clear", { method: "POST" });

  const res = await handleAdminBrandingLogoClear(req, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    appDb: {
      siteSettings: {
        upsert: async ({ update }: { update: { logoAssetId: string | null } }) => {
          settingsLogoAssetId = update.logoAssetId;
          return { id: "default", logoAssetId: update.logoAssetId };
        },
      },
    } as never,
  });

  assert.equal(res.status, 200);
  assert.equal(settingsLogoAssetId, null);
});


test("POST /api/admin/branding/logo/clear returns 403 for non-admin", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo/clear", { method: "POST" });
  const res = await handleAdminBrandingLogoClear(req, {
    requireAdminUser: async () => { throw new Error("forbidden"); },
  });

  assert.equal(res.status, 403);
});
test("GET /api/admin/branding/logo returns 403 for non-admin", async () => {
  const req = new NextRequest("http://localhost/api/admin/branding/logo");
  const res = await handleAdminBrandingLogoGet(req, {
    requireAdminUser: async () => {
      throw new Error("forbidden");
    },
  });

  assert.equal(res.status, 403);
});
