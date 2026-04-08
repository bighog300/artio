import test from "node:test";
import assert from "node:assert/strict";
import { handleEventModerationIntent } from "../lib/admin-events-moderation-intent-route";

const params = { id: "11111111-1111-4111-8111-111111111111" };

function makeEventRecord(overrides: Partial<{
  id: string;
  slug: string | null;
  deletedAt: Date | null;
  startAt: Date | null;
  timezone: string | null;
  venue: { status: string | null; isPublished: boolean | null } | null;
  _count: { images: number };
}> = {}) {
  return {
    id: params.id,
    slug: "my-event",
    deletedAt: null,
    startAt: new Date("2026-01-01T12:00:00.000Z"),
    timezone: "America/New_York",
    venue: { status: "PUBLISHED", isPublished: true },
    _count: { images: 1 },
    ...overrides,
  };
}

test("approve_publish transitions status and returns publicUrl", async () => {
  let lastUpdate: Record<string, unknown> | null = null;
  const req = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve_publish" }) });
  const res = await handleEventModerationIntent(req, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord(),
    updateEvent: async (_id, data) => { lastUpdate = data; },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "PUBLISHED");
  assert.equal(body.publicUrl, "/events/my-event");
  assert.equal(lastUpdate?.status, "PUBLISHED");
});

test("approve_publish returns 409 when event has no images", async () => {
  let updateCalled = false;
  const req = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve_publish" }) });
  const res = await handleEventModerationIntent(req, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord({ _count: { images: 0 } }),
    updateEvent: async () => { updateCalled = true; },
  });

  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.error.code, "publish_blocked");
  assert.equal(updateCalled, false);
  assert.equal(Array.isArray(body.error.details.blockers), true);
  assert.equal(body.error.details.blockers.some((b: { id: string }) => b.id === "coverImage"), true);
});

test("request_changes requires reason and sets CHANGES_REQUESTED", async () => {
  const badReq = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request_changes" }) });
  const badRes = await handleEventModerationIntent(badReq, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord({ slug: "x" }),
    updateEvent: async () => undefined,
  });
  assert.equal(badRes.status, 400);

  let status = "";
  const okReq = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request_changes", reason: "Please fix date" }) });
  const okRes = await handleEventModerationIntent(okReq, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord({ slug: "x" }),
    updateEvent: async (_id, data) => { status = String(data.status); },
  });
  assert.equal(okRes.status, 200);
  assert.equal(status, "CHANGES_REQUESTED");
});

test("reject requires reason and sets REJECTED", async () => {
  const badReq = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject" }) });
  const badRes = await handleEventModerationIntent(badReq, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord({ slug: "x" }),
    updateEvent: async () => undefined,
  });
  assert.equal(badRes.status, 400);

  let status = "";
  const okReq = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject", reason: "Not suitable" }) });
  const okRes = await handleEventModerationIntent(okReq, params, {
    requireAdminUser: async () => ({ email: "admin@example.com" }),
    findEvent: async () => makeEventRecord({ slug: "x" }),
    updateEvent: async (_id, data) => { status = String(data.status); },
  });
  assert.equal(okRes.status, 200);
  assert.equal(status, "REJECTED");
});

test("non-admin access denied", async () => {
  const req = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve_publish" }) });
  const res = await handleEventModerationIntent(req, params, {
    requireAdminUser: async () => { throw new Error("forbidden"); },
    findEvent: async () => makeEventRecord({ slug: "x" }),
    updateEvent: async () => undefined,
  });
  assert.equal(res.status, 403);
});
