import test from "node:test";
import assert from "node:assert/strict";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";

type RunRecord = {
  id: string;
  status: string;
  venueId: string;
  sourceUrl: string;
  startedAt: Date | null;
};

function createStore() {
  const runs: RunRecord[] = [];
  const extracted: Array<Record<string, unknown>> = [];

  return {
    runs,
    extracted,
    ingestRun: {
      create: async ({ data }: { data: { venueId: string; sourceUrl: string; status: string; startedAt: Date } }) => {
        const run = {
          id: `run-${runs.length + 1}`,
          status: data.status,
          venueId: data.venueId,
          sourceUrl: data.sourceUrl,
          startedAt: data.startedAt,
        };
        runs.push(run);
        return run;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = runs.find((item) => item.id === where.id);
        if (!run) throw new Error("run not found");
        Object.assign(run, data);
        return run;
      },
    },
    venue: {
      findUnique: async () => ({ country: "United Kingdom", lat: null, lng: null, name: "Venue", addressLine1: null, city: null, eventsPageUrl: null }),
    },
    siteSettings: {
      findUnique: async () => null,
    },
    ingestExtractedEvent: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ext-${extracted.length + 1}`, createdAt: new Date(), ...data };
        extracted.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = extracted.find((item) => item.id === where.id);
        if (!row) throw new Error("candidate not found");
        Object.assign(row, data);
        return row;
      },
    },
  };
}

const previousEnabled = process.env.AI_INGEST_ENABLED;
const previousApiKey = process.env.OPENAI_API_KEY;
const previousCandidateCap = process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN;

test.after(() => {
  process.env.AI_INGEST_ENABLED = previousEnabled;
  process.env.OPENAI_API_KEY = previousApiKey;
  process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN = previousCandidateCap;
});

test("caps candidates after ranking by confidence proxy", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN = "2";

  const store = createStore();

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [
          { title: "Low quality first", startAt: null, locationText: null },
          { title: "Medium quality second", startAt: "2026-07-01T19:00:00.000Z", locationText: null },
          { title: "High quality third", startAt: "2026-07-02T19:00:00.000Z", locationText: "Main Hall" },
        ],
        venueSnapshot: {},
        raw: [],
      }),
    },
  );

  assert.equal(result.createdCount, 2);
  assert.equal(result.stopReason, "CANDIDATE_CAP_REACHED");
  const createdTitles = store.extracted.map((row) => String(row.title));
  assert.deepEqual(createdTitles, ["High quality third", "Medium quality second"]);
});
