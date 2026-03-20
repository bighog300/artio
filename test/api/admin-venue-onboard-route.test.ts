import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminVenueOnboard } from "../../lib/admin-venue-onboard-route";

const venueId = "11111111-1111-4111-8111-111111111111";

function makeDeps(overrides: Partial<Parameters<typeof handleAdminVenueOnboard>[2]> = {}) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const ingestCreates: Array<{ venueId: string; sourceUrl: string; status: string }> = [];

  const deps: Parameters<typeof handleAdminVenueOnboard>[2] = {
    requireAdminFn: async () => ({ email: "admin@example.com" } as never),
    logAction: async () => {},
    appDb: {
      venue: {
        findUnique: async () => ({
          id: venueId,
          status: "ONBOARDING",
          featuredAssetId: "asset-1",
          websiteUrl: "https://example.com",
          eventsPageUrl: "https://example.com/events",
          country: "US",
          lat: 1,
          lng: 1,
          name: "Ready Venue",
          city: "New York",
        }),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ where, data });
          return { id: where.id };
        },
      },
      ingestRun: {
        create: async ({ data }: { data: { venueId: string; sourceUrl: string; status: string } }) => {
          ingestCreates.push(data);
          return { id: "run-1" };
        },
      },
    } as never,
    ...overrides,
  };

  return { deps, updates, ingestCreates };
}

test("returns 409 when venue is not in ONBOARDING", async () => {
  const { deps } = makeDeps({
    appDb: {
      venue: {
        findUnique: async () => ({
          id: venueId,
          status: "DRAFT",
          featuredAssetId: "asset-1",
          websiteUrl: "https://example.com",
          eventsPageUrl: null,
          country: "US",
          lat: 1,
          lng: 1,
          name: "Venue",
          city: "NYC",
        }),
        update: async () => ({ id: venueId }),
      },
      ingestRun: { create: async () => ({ id: "run-1" }) },
    } as never,
  });

  const response = await handleAdminVenueOnboard(
    new Request(`http://localhost/api/admin/venues/${venueId}/onboard`, { method: "POST" }),
    { id: venueId },
    deps,
  );

  assert.equal(response.status, 409);
});

test("returns 422 when publish blockers exist", async () => {
  const { deps } = makeDeps({
    appDb: {
      venue: {
        findUnique: async () => ({
          id: venueId,
          status: "ONBOARDING",
          featuredAssetId: "asset-1",
          websiteUrl: "https://example.com",
          eventsPageUrl: null,
          country: "US",
          lat: null,
          lng: null,
          name: "Venue",
          city: "NYC",
        }),
        update: async () => ({ id: venueId }),
      },
      ingestRun: { create: async () => ({ id: "run-1" }) },
    } as never,
  });

  const response = await handleAdminVenueOnboard(
    new Request(`http://localhost/api/admin/venues/${venueId}/onboard`, { method: "POST" }),
    { id: venueId },
    deps,
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, "publish_blocked");
});

test("publishes and creates ingest run when source URL exists", async () => {
  const { deps, updates, ingestCreates } = makeDeps();
  const response = await handleAdminVenueOnboard(
    new Request(`http://localhost/api/admin/venues/${venueId}/onboard`, { method: "POST" }),
    { id: venueId },
    deps,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { published: true, venueId, ingestRunCreated: true });
  assert.equal(updates.some((u) => u.data.status === "PUBLISHED" && u.data.isPublished === true), true);
  assert.equal(ingestCreates.length, 1);
});

test("publishes without ingest run when no source URL is available", async () => {
  const { deps, ingestCreates } = makeDeps({
    appDb: {
      venue: {
        findUnique: async () => ({
          id: venueId,
          status: "ONBOARDING",
          featuredAssetId: "asset-1",
          websiteUrl: null,
          eventsPageUrl: null,
          country: "US",
          lat: 1,
          lng: 1,
          name: "Venue",
          city: "NYC",
        }),
        update: async () => ({ id: venueId }),
      },
      ingestRun: { create: async () => ({ id: "run-1" }) },
    } as never,
  });
  const response = await handleAdminVenueOnboard(
    new Request(`http://localhost/api/admin/venues/${venueId}/onboard`, { method: "POST" }),
    { id: venueId },
    deps,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ingestRunCreated, false);
  assert.equal(ingestCreates.length, 0);
});

test("request eventsPageUrl overrides stored URL for ingest source", async () => {
  const { deps, updates, ingestCreates } = makeDeps();
  const response = await handleAdminVenueOnboard(
    new Request(`http://localhost/api/admin/venues/${venueId}/onboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventsPageUrl: "https://example.com/program" }),
    }),
    { id: venueId },
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(updates.some((u) => u.data.eventsPageUrl === "https://example.com/program"), true);
  assert.equal(ingestCreates[0]?.sourceUrl, "https://example.com/program");
});
