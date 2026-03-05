import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminVenuePatch } from "../../lib/admin-venue-patch-route";

const venueId = "11111111-1111-4111-8111-111111111111";

test("PATCH description updates venue and returns ok", async () => {
  const updates: Array<Record<string, unknown>> = [];

  const req = new Request(`http://localhost/api/admin/venues/${venueId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: "A gallery in London" }),
  });

  const res = await handleAdminVenuePatch(req, { id: venueId }, "admin@example.com", {
    appDb: {
      venue: {
        findUnique: async () => ({ id: venueId }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: venueId, ...data };
        },
      },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(updates[0], { description: "A gallery in London" });
  assert.deepEqual(await res.json(), { ok: true });
});

test("PATCH invalid contactEmail returns 400", async () => {
  const req = new Request(`http://localhost/api/admin/venues/${venueId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contactEmail: "not-an-email" }),
  });

  const res = await handleAdminVenuePatch(req, { id: venueId }, "admin@example.com", {
    appDb: {
      venue: { findUnique: async () => ({ id: venueId }), update: async () => ({ id: venueId }) },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 400);
});

test("PATCH invalid instagramUrl returns 400", async () => {
  const req = new Request(`http://localhost/api/admin/venues/${venueId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instagramUrl: "not-a-url" }),
  });

  const res = await handleAdminVenuePatch(req, { id: venueId }, "admin@example.com", {
    appDb: {
      venue: { findUnique: async () => ({ id: venueId }), update: async () => ({ id: venueId }) },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 400);
});

test("PATCH unknown venue id returns 404", async () => {
  const req = new Request(`http://localhost/api/admin/venues/${venueId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: "A gallery in London" }),
  });

  const res = await handleAdminVenuePatch(req, { id: venueId }, "admin@example.com", {
    appDb: {
      venue: {
        findUnique: async () => null,
        update: async () => ({ id: venueId }),
      },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 404);
});

test("PATCH description null clears field and returns ok", async () => {
  const updates: Array<Record<string, unknown>> = [];

  const req = new Request(`http://localhost/api/admin/venues/${venueId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: null }),
  });

  const res = await handleAdminVenuePatch(req, { id: venueId }, "admin@example.com", {
    appDb: {
      venue: {
        findUnique: async () => ({ id: venueId }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: venueId, ...data };
        },
      },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(updates[0], { description: null });
  assert.deepEqual(await res.json(), { ok: true });
});
