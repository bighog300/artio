import test from "node:test";
import assert from "node:assert/strict";
import { runVenueGenerationPhase1 } from "../lib/venue-generation/generation-pipeline";

function baseDb() {
  const createdItems: Array<Record<string, unknown>> = [];
  const runs: Array<Record<string, unknown>> = [];
  return {
    createdItems,
    runs,
    db: {
      venue: {
        findFirst: async () => null,
      },
      venueGenerationRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          runs.push({ phase: "create", ...data });
          return { id: "run-1" };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          runs.push({ phase: "update", ...data });
          return { id: "run-1" };
        },
      },
      venueGenerationRunItem: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdItems.push(data);
          return { id: `item-${createdItems.length}` };
        },
      },
    },
  };
}

test("venue generation phase1 queues pending items and tracks skips", async () => {
  const state = baseDb();

  const result = await runVenueGenerationPhase1({
    input: { country: "South Africa", region: "Western Cape" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            {
              name: "Queued Venue",
              addressLine1: "1 Main",
              addressLine2: null,
              city: "Cape Town",
              region: "Western Cape",
              postcode: "8001",
              country: "South Africa",
              contactEmail: null,
              contactPhone: null,
              websiteUrl: "https://example.com",
              instagramUrl: null,
              facebookUrl: null,
              openingHours: null,
              venueType: "GALLERY",
            },
            {
              name: "Queued Venue",
              addressLine1: "1 Main",
              addressLine2: null,
              city: "Cape Town",
              region: "Western Cape",
              postcode: "8001",
              country: "South Africa",
              contactEmail: null,
              contactPhone: null,
              websiteUrl: null,
              instagramUrl: null,
              facebookUrl: null,
              openingHours: null,
              venueType: "GALLERY",
            },
          ],
        },
      }),
    },
  });

  assert.equal(result.totalReturned, 2);
  assert.equal(result.totalQueued, 1);
  assert.equal(result.totalSkipped, 1);
  assert.equal(state.createdItems[0].status, "pending_processing");
  assert.equal(state.createdItems[1].status, "skipped");
});

test("venue generation phase1 does not call geocode or homepage fetch", async () => {
  const state = baseDb();
  let geocodeCalled = false;
  let fetchCalled = false;

  await runVenueGenerationPhase1({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            {
              name: "Only Queue",
              addressLine1: null,
              addressLine2: null,
              city: "London",
              region: "England",
              postcode: null,
              country: "United Kingdom",
              contactEmail: null,
              contactPhone: null,
              websiteUrl: null,
              instagramUrl: null,
              facebookUrl: null,
              openingHours: null,
              venueType: "MUSEUM",
            },
          ],
        },
      }),
    },
    geocode: async () => {
      geocodeCalled = true;
      return null;
    },
    fetchHtmlFn: async () => {
      fetchCalled = true;
      return null as never;
    },
  } as never);

  assert.equal(geocodeCalled, false);
  assert.equal(fetchCalled, false);
});
