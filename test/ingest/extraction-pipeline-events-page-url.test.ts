import test from "node:test";
import assert from "node:assert/strict";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";

function createStore(params: { eventsPageUrl: string | null; updateReject?: boolean } = { eventsPageUrl: null }) {
  const runs: Array<Record<string, unknown>> = [];
  const venueUpdates: Array<{ where: { id: string }; data: { eventsPageUrl: string } }> = [];

  return {
    runs,
    venueUpdates,
    ingestRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const run = { id: `run-${runs.length + 1}`, ...data };
        runs.push(run);
        return run;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = runs.find((r) => r.id === where.id);
        if (!run) throw new Error("run not found");
        Object.assign(run, data);
        return run;
      },
    },
    venue: {
      findUnique: async () => ({
        country: null,
        name: "Venue",
        addressLine1: null,
        city: null,
        eventsPageUrl: params.eventsPageUrl,
        lat: null,
        lng: null,
      }),
      update: async (args: { where: { id: string }; data: { eventsPageUrl: string } }) => {
        venueUpdates.push(args);
        if (params.updateReject) throw new Error("update failed");
        return { id: args.where.id };
      },
    },
    siteSettings: {
      findUnique: async () => null,
    },
    ingestExtractedEvent: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => ({ id: "ext-1", createdAt: new Date() }),
      update: async () => ({ id: "ext-1" }),
    },
  };
}

const prevEnabled = process.env.AI_INGEST_ENABLED;
const prevKey = process.env.OPENAI_API_KEY;

test.beforeEach(() => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
});

test.after(() => {
  process.env.AI_INGEST_ENABLED = prevEnabled;
  process.env.OPENAI_API_KEY = prevKey;
});

async function runWithHtml(html: string, eventsPageUrl: string | null = null) {
  const store = createStore({ eventsPageUrl });
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store: store as never,
      fetchHtml: async () => ({
        finalUrl: "https://example.com",
        status: 200,
        contentType: "text/html",
        bytes: 100,
        html,
      }),
      extractWithOpenAI: async () => ({ model: "m", events: [], venueSnapshot: {}, raw: [] }),
    },
  );
  await new Promise((r) => setTimeout(r, 0));
  return store;
}

test("detects exhibitions href and resolves to absolute url", async () => {
  const store = await runWithHtml('<a href="/exhibitions/">Exhibitions</a>');
  assert.equal(store.venueUpdates.length, 1);
  assert.deepEqual(store.venueUpdates[0], {
    where: { id: "venue-1" },
    data: { eventsPageUrl: "https://example.com/exhibitions/" },
  });
});

test("ignores links to external domains", async () => {
  const store = await runWithHtml('<a href="https://othersite.com/events">Events</a>');
  assert.equal(store.venueUpdates.length, 0);
});

test("returns no detected URL when matching links are absent", async () => {
  const store = await runWithHtml('<a href="/about">About</a>');
  assert.equal(store.venueUpdates.length, 0);
});

test("does not update when venue already has eventsPageUrl", async () => {
  const store = await runWithHtml('<a href="/events">Events</a>', "https://example.com/existing-events");
  assert.equal(store.venueUpdates.length, 0);
});
