import test from "node:test";
import assert from "node:assert/strict";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { getIngestStalenessThresholdMs, isVenueIngestStale } from "@/lib/cron-ingest-venues";

function createStore() {
  const venueUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const runs: Array<Record<string, unknown>> = [];

  return {
    venueUpdates,
    ingestRun: {
      create: async ({ data }: { data: { venueId: string; sourceUrl: string; status: string; startedAt: Date } }) => {
        const run = { id: `run-${runs.length + 1}`, ...data };
        runs.push(run);
        return run;
      },
      update: async () => ({ id: "run-1" }),
    },
    ingestExtractedEvent: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "candidate-1", ...data }),
      update: async () => ({ id: "candidate-1" }),
    },
    venue: {
      findUnique: async () => ({
        country: "US",
        lat: null,
        lng: null,
        name: "Venue",
        addressLine1: null,
        city: null,
        eventsPageUrl: null,
      }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        venueUpdates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
    siteSettings: {
      findUnique: async () => null,
    },
  };
}

test("pipeline sets usesJsonLd + lastIngestedAt when JSON-LD extraction succeeds", async () => {
  const store = createStore();
  process.env.AI_INGEST_ENABLED = "1";

  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store: store as never,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({ attempted: true, events: [{ title: "JSON-LD Event", startAt: new Date("2026-07-01T19:00:00.000Z"), sourceUrl: "https://example.com/events" }] }),
    },
  );

  const jsonLdUpdate = store.venueUpdates.find((entry) => entry.data.usesJsonLd === true);
  assert.ok(jsonLdUpdate);
  assert.equal(jsonLdUpdate?.where.id, "venue-1");
  assert.ok(jsonLdUpdate?.data.lastIngestedAt instanceof Date);
});

test("pipeline sets lastIngestedAt on AI-path success", async () => {
  const store = createStore();
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  await runVenueIngestExtraction(
    { venueId: "venue-2", sourceUrl: "https://example.com/events" },
    {
      store: store as never,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({ attempted: false, events: [] }),
      extractWithOpenAI: async () => ({ model: "test-model", usage: undefined, events: [{ title: "AI Event", startAt: "2026-07-01T19:00:00.000Z", sourceUrl: "https://example.com/events" }], venueSnapshot: {}, raw: [] }),
    },
  );

  const aiUpdate = store.venueUpdates.find((entry) => Object.keys(entry.data).length === 1 && entry.data.lastIngestedAt instanceof Date);
  assert.ok(aiUpdate);
});

test("pipeline does not block when venue.update fails", async () => {
  const store = createStore();
  store.venue.update = async () => {
    throw new Error("boom");
  };
  process.env.AI_INGEST_ENABLED = "1";

  const result = await runVenueIngestExtraction(
    { venueId: "venue-3", sourceUrl: "https://example.com/events" },
    {
      store: store as never,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({ attempted: true, events: [{ title: "JSON-LD Event", startAt: new Date("2026-07-01T19:00:00.000Z"), sourceUrl: "https://example.com/events" }] }),
    },
  );

  assert.equal(result.runId, "run-1");
});

test("getIngestStalenessThresholdMs returns 12h for JSON-LD and 48h for AI", () => {
  assert.equal(getIngestStalenessThresholdMs(true), 43_200_000);
  assert.equal(getIngestStalenessThresholdMs(false), 172_800_000);
});

test("isVenueIngestStale respects JSON-LD vs AI windows", () => {
  const nowMs = Date.parse("2026-04-10T12:00:00.000Z");

  assert.equal(isVenueIngestStale({ usesJsonLd: true, lastIngestedAt: null, nowMs }), true);
  assert.equal(isVenueIngestStale({ usesJsonLd: true, lastIngestedAt: new Date(nowMs - 6 * 60 * 60 * 1000), nowMs }), false);
  assert.equal(isVenueIngestStale({ usesJsonLd: true, lastIngestedAt: new Date(nowMs - 13 * 60 * 60 * 1000), nowMs }), true);

  assert.equal(isVenueIngestStale({ usesJsonLd: false, lastIngestedAt: new Date(nowMs - 24 * 60 * 60 * 1000), nowMs }), false);
  assert.equal(isVenueIngestStale({ usesJsonLd: false, lastIngestedAt: new Date(nowMs - 50 * 60 * 60 * 1000), nowMs }), true);
});
