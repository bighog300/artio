import test from "node:test";
import assert from "node:assert/strict";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { IngestError } from "@/lib/ingest/errors";

type RunRecord = {
  id: string;
  status: string;
  venueId: string;
  sourceUrl: string;
  startedAt: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  fetchFinalUrl?: string | null;
  fetchStatus?: number | null;
  fetchContentType?: string | null;
  fetchBytes?: number | null;
  createdCandidates?: number;
  createdDuplicates?: number;
  dedupedCandidates?: number;
  totalCandidatesReturned?: number;
  model?: string | null;
  extractionMethod?: string | null;
  usagePromptTokens?: number | null;
  usageCompletionTokens?: number | null;
  usageTotalTokens?: number | null;
  stopReason?: string | null;
  detectedPlatform?: string | null;
  venueSnapshot?: Record<string, unknown> | null;
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
          createdCandidates: 0,
          createdDuplicates: 0,
          dedupedCandidates: 0,
          totalCandidatesReturned: 0,
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
      findUnique: async ({ where }: { where: { venueId_fingerprint: { venueId: string; fingerprint: string } } }) => {
        return (
          extracted.find(
            (item) => item.venueId === where.venueId_fingerprint.venueId && item.fingerprint === where.venueId_fingerprint.fingerprint,
          ) ?? null
        ) as { id: string } | null;
      },
      findMany: async ({ where }: { where: { venueId: string; createdAt?: { gte: Date }; status?: { in: string[] }; duplicateOfId?: null } }) => {
        return extracted.filter((row) => {
          if (row.venueId !== where.venueId) return false;
          if (where.status && !where.status.in.includes(String(row.status))) return false;
          if (where.duplicateOfId === null && row.duplicateOfId !== null && row.duplicateOfId !== undefined) return false;
          if (where.createdAt?.gte && row.createdAt instanceof Date && row.createdAt < where.createdAt.gte) return false;
          return true;
        }) as Array<{ id: string; title: string; startAt: Date | null; locationText: string | null; similarityKey: string }>;
      },
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
const previousThreshold = process.env.AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD;
const previousDefaultDuration = process.env.AI_INGEST_DEFAULT_DURATION_MINUTES;

test.after(() => {
  process.env.AI_INGEST_ENABLED = previousEnabled;
  process.env.OPENAI_API_KEY = previousApiKey;
  process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN = previousCandidateCap;
  process.env.AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD = previousThreshold;
  process.env.AI_INGEST_DEFAULT_DURATION_MINUTES = previousDefaultDuration;
});

test("dedupe skips existing fingerprint", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "already", startAt: "2025-01-01T10:00:00.000Z", locationText: "main hall" }], venueSnapshot: {}, raw: [] }),
    },
  );

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "already", startAt: "2025-01-01T10:00:00.000Z", locationText: "main hall" }], venueSnapshot: {}, raw: [] }),
    },
  );

  assert.equal(result.createdCount, 0);
  assert.equal(result.dedupedCount, 1);
});

test("within-run near duplicate is persisted as DUPLICATE", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD = "85";

  const store = createStore();
  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [
          { title: "Summer Opening", startAt: "2026-07-01T19:00:00.000Z", locationText: "Main Hall" },
          { title: "The Summer Opening", startAt: "2026-07-01T19:30:00.000Z", locationText: "Main Hall" },
        ],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.createdDuplicateCount, 1);
  assert.equal(store.runs[0]?.venueSnapshot, undefined);
  const primary = store.extracted.find((row) => row.status === "PENDING");
  assert.equal(typeof primary?.confidenceScore, "number");
  assert.match(String(primary?.confidenceBand), /HIGH|MEDIUM|LOW/);
  const duplicate = store.extracted.find((row) => row.status === "DUPLICATE");
  assert.ok(duplicate);
  assert.equal(typeof duplicate.duplicateOfId, "string");
  assert.equal(duplicate?.confidenceScore, primary?.confidenceScore);
  assert.equal(duplicate?.confidenceBand, primary?.confidenceBand);
});

test("historical near duplicate links to existing primary", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  store.extracted.push({
    id: "historical-1",
    createdAt: new Date(),
    venueId: "venue-1",
    status: "APPROVED",
    duplicateOfId: null,
    similarityKey: "k1",
    title: "Summer Opening",
    startAt: new Date("2026-07-01T19:00:00.000Z"),
    locationText: "Main Hall",
    fingerprint: "existing-fingerprint",
  });

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "The Summer Opening", startAt: "2026-07-01T20:00:00.000Z", locationText: "Main Hall" }],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  assert.equal(result.createdCount, 0);
  assert.equal(result.createdDuplicateCount, 1);
  const created = store.extracted.find((row) => row.id !== "historical-1");
  assert.equal(created?.status, "DUPLICATE");
  assert.equal(created?.duplicateOfId, "historical-1");
  assert.equal(typeof created?.confidenceScore, "number");
});

test("invalid model output marks run as failed", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();

  await assert.rejects(
    () =>
      runVenueIngestExtraction(
        { venueId: "venue-1", sourceUrl: "https://example.com" },
        {
          store,
          fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
          extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "" }], venueSnapshot: {}, raw: {} }),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      return error.code === "BAD_MODEL_OUTPUT";
    },
  );

  assert.equal(store.runs[0]?.status, "FAILED");
});


test("infers endAt when startAt exists and endAt is missing", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_INGEST_DEFAULT_DURATION_MINUTES = "120";

  const store = createStore();
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "Timed Event", startAt: "2026-07-01T19:00:00.000Z", endAt: null, timezone: "UTC", locationText: "Main Hall" }],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  const created = store.extracted.find((row) => row.title === "Timed Event");
  assert.ok(created);
  assert.equal((created?.startAt as Date).toISOString(), "2026-07-01T19:00:00.000Z");
  assert.equal((created?.endAt as Date).toISOString(), "2026-07-01T21:00:00.000Z");
});

test("keeps candidate missing startAt non-approvable", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "No Start", startAt: null, endAt: null, timezone: null, locationText: "Main Hall" }],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  const created = store.extracted.find((row) => row.title === "No Start");
  assert.equal(created?.startAt, null);
  assert.equal(created?.endAt, null);
});


test("infers Europe/London timezone for UK sources when missing", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://venue.example.uk/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://venue.example.uk/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "UK Event", startAt: "2026-07-01T19:00:00.000Z", endAt: null, timezone: null, locationText: "Main Hall" }],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  const created = store.extracted.find((row) => row.title === "UK Event");
  assert.equal(created?.timezone, "Europe/London");
});


test("infers timezone from venue lat/lng when missing", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  store.venue.findUnique = async () => ({
    country: null,
    lat: 40.7128,
    lng: -74.006,
    name: "Venue",
    addressLine1: null,
    city: null,
    eventsPageUrl: null,
  });

  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://venue.example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://venue.example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "LatLng Event", startAt: "2026-07-01T19:00:00.000Z", endAt: null, timezone: null, locationText: "Main Hall" }],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  const created = store.extracted.find((row) => row.title === "LatLng Event");
  assert.ok(created?.timezone);
});

test("returns stopReason when model returns more candidates than cap", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN = "1";

  const store = createStore();
  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [
          { title: "Event 1", startAt: "2026-07-01T19:00:00.000Z", locationText: "Main Hall" },
          { title: "Event 2", startAt: "2026-07-02T19:00:00.000Z", locationText: "Main Hall" },
        ],
        venueSnapshot: {}, raw: [],
      }),
    },
  );

  assert.equal(result.stopReason, "CANDIDATE_CAP_REACHED");
});


test("resolves relative imageUrl against fetched finalUrl before storing", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://gallery.example.com/start" },
    {
      store,
      fetchHtml: async () => ({
        finalUrl: "https://gallery.example.com/exhibitions",
        status: 200,
        contentType: "text/html",
        bytes: 100,
        html: "<html></html>",
      }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [
          {
            title: "Relative Image",
            startAt: "2026-07-01T19:00:00.000Z",
            locationText: "Main Hall",
            imageUrl: "/exhibitions/show.jpg",
          },
        ],
        venueSnapshot: {},
        raw: [],
      }),
    },
  );

  const created = store.extracted.find((row) => row.title === "Relative Image");
  assert.equal(created?.imageUrl, "https://gallery.example.com/exhibitions/show.jpg");
});


test("uses json-ld extraction and skips openai when structured events are found", async () => {
  process.env.AI_INGEST_ENABLED = "0";
  process.env.OPENAI_API_KEY = "";

  const store = createStore();
  let openAiCalls = 0;
  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({
        attempted: true,
        events: [{ title: "JSON-LD Event", startAt: new Date("2026-07-01T19:00:00.000Z"), endAt: null, timezone: null, locationText: "Main Hall", description: null, sourceUrl: null, artistNames: [], imageUrl: null }],
      }),
      extractWithOpenAI: async () => {
        openAiCalls += 1;
        return { model: "test-model", events: [], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(result.createdCount, 1);
  assert.equal(openAiCalls, 0);
  assert.equal(store.runs[0]?.status, "SUCCEEDED");
  assert.equal(store.runs[0]?.extractionMethod, "json_ld");
  assert.equal(store.runs[0]?.model ?? null, null);
});

test("falls through to openai when json-ld attempted but no valid events", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  let openAiCalls = 0;
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({ attempted: true, events: [] }),
      extractWithOpenAI: async () => {
        openAiCalls += 1;
        return { model: "test-model", events: [{ title: "Fallback", startAt: "2026-07-01T19:00:00.000Z", locationText: "Main Hall" }], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(openAiCalls, 1);
  assert.equal(store.runs[0]?.extractionMethod, "openai");
});

test("falls through to openai when no json-ld blocks were found", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  let openAiCalls = 0;
  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com/events" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractJsonLd: () => ({ attempted: false, events: [] }),
      extractWithOpenAI: async () => {
        openAiCalls += 1;
        return { model: "test-model", events: [{ title: "Fallback", startAt: "2026-07-01T19:00:00.000Z", locationText: "Main Hall" }], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(openAiCalls, 1);
  assert.equal(store.runs[0]?.extractionMethod, "openai");
});


test("JS-rendered platform short-circuits before OpenAI", async () => {
  process.env.AI_INGEST_ENABLED = "0";
  process.env.OPENAI_API_KEY = "";

  const store = createStore();
  let openAiCalled = false;

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      detectPlatformFn: () => "wix",
      extractWithOpenAI: async () => {
        openAiCalled = true;
        return { model: "test-model", events: [], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(openAiCalled, false);
  assert.equal(result.createdCount, 0);
  assert.equal(result.stopReason, "PLATFORM_REQUIRES_JS");
  assert.equal(store.runs[0]?.status, "SUCCEEDED");
  assert.equal(store.runs[0]?.stopReason, "PLATFORM_REQUIRES_JS");
  assert.equal(store.runs[0]?.detectedPlatform, "wix");
});

test("non-JS platform passes platform hint to OpenAI", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  let capturedHint: string | null | undefined;

  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      detectPlatformFn: () => "artlogic",
      extractWithOpenAI: async (params) => {
        capturedHint = params.platformHint;
        return { model: "test-model", events: [{ title: "A" }], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(typeof capturedHint, "string");
  assert.match(capturedHint ?? "", /Artlogic/);
});

test("unknown platform passes null hint", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  let capturedHint: string | null | undefined;

  await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      detectPlatformFn: () => "unknown",
      extractWithOpenAI: async (params) => {
        capturedHint = params.platformHint;
        return { model: "test-model", events: [{ title: "A" }], venueSnapshot: {}, raw: [] };
      },
    },
  );

  assert.equal(capturedHint, null);
});
