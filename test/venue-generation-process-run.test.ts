import test from "node:test";
import assert from "node:assert/strict";
import { ForwardGeocodeError } from "../lib/geocode/forward";
import { runVenueGenerationProcessRunJob } from "../lib/jobs/venue-generation-process-run";

function makeDb(itemsCount = 1) {
  const runUpdates: any[] = [];
  const itemUpdates: any[] = [];
  const createdVenues: any[] = [];
  const items = Array.from({ length: itemsCount }, (_, i) => ({
    id: `item-${i + 1}`,
    runId: "run-1",
    name: `Venue ${i + 1}`,
    city: "Cape Town",
    postcode: null,
    country: "South Africa",
    status: "pending_processing",
    contactEmail: null,
    contactPhone: null,
    websiteUrl: "https://example.com",
    instagramUrl: null,
    facebookUrl: null,
    openingHours: null,
    addressLine1: null,
    addressLine2: null,
    region: "Western Cape",
  }));

  const db = {
    venueGenerationRun: {
      findUnique: async () => ({ id: "run-1" }),
      update: async ({ data }: any) => {
        runUpdates.push(data);
        return { id: "run-1" };
      },
    },
    venueGenerationRunItem: {
      findMany: async () => items,
      update: async ({ where, data }: any) => {
        itemUpdates.push({ where, data });
        return { id: where.id };
      },
      count: async ({ where }: any) => items.filter((x) => x.runId === where.runId && x.status === "skipped").length,
    },
    venue: {
      findUnique: async () => null,
      findFirst: async ({ where }: any = {}) => where?.id ? { id: where.id, name: "x", city: "y", country: "z", lat: 1, lng: 1, featuredAssetId: null, status: "DRAFT" } : null,
      create: async ({ data }: any) => {
        createdVenues.push(data);
        return { id: `venue-${createdVenues.length}` };
      },
      update: async () => ({ id: "venue-1" }),
    },
    venueHomepageImageCandidate: {
      createMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      update: async () => ({ id: "cand-1" }),
    },
    asset: { create: async () => ({ id: "asset-1" }) },
    venueImage: { create: async () => ({ id: "image-1" }) },
  };

  return { db: db as any, runUpdates, itemUpdates, createdVenues, items };
}

test("process-run job processes pending items and marks run SUCCEEDED", async () => {
  const state = makeDb(2);
  const result = await runVenueGenerationProcessRunJob({ db: state.db, runId: "run-1", geocodeFn: async () => ({ lat: 1, lng: 1 }), fetchHtmlFn: async () => null as never });

  assert.equal(result.metadata?.totalCreated, 2);
  assert.equal(state.runUpdates.at(-1).status, "SUCCEEDED");
  assert.equal(state.itemUpdates.filter((u) => u.data.status === "created").length, 2);
});

test("geocode failure marks item failed but continues", async () => {
  const state = makeDb(2);
  let i = 0;
  await runVenueGenerationProcessRunJob({
    db: state.db,
    runId: "run-1",
    geocodeFn: async () => {
      i += 1;
      if (i === 1) throw new ForwardGeocodeError("provider_error", "boom");
      return { lat: 1, lng: 1 };
    },
    fetchHtmlFn: async () => null as never,
  });

  assert.equal(state.itemUpdates.some((u) => u.data.status === "failed"), true);
  assert.equal(state.itemUpdates.some((u) => u.data.status === "created"), true);
});

test("homepage fetch failure tolerated with fetch_failed", async () => {
  const state = makeDb(1);
  await runVenueGenerationProcessRunJob({ db: state.db, runId: "run-1", geocodeFn: async () => ({ lat: 1, lng: 1 }), fetchHtmlFn: async () => null as never });
  const createdUpdate = state.itemUpdates.find((u) => u.data.status === "created");
  assert.equal(createdUpdate.data.homepageImageStatus, "fetch_failed");
});

test("concurrency batching limits concurrent processing", async () => {
  const state = makeDb(7);
  let active = 0;
  let maxActive = 0;
  await runVenueGenerationProcessRunJob({
    db: state.db,
    runId: "run-1",
    concurrency: 3,
    geocodeFn: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return { lat: 1, lng: 1 };
    },
    fetchHtmlFn: async () => null as never,
  });
  assert.equal(maxActive, 3);
});

test("run not found returns error result", async () => {
  const state = makeDb(1);
  state.db.venueGenerationRun.findUnique = async () => null;
  const result = await runVenueGenerationProcessRunJob({ db: state.db, runId: "missing" });
  assert.equal(result.metadata?.error, "run_not_found");
});
