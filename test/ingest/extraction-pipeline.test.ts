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
  errorCode?: string | null;
  errorMessage?: string | null;
  fetchFinalUrl?: string | null;
  fetchStatus?: number | null;
  fetchContentType?: string | null;
  fetchBytes?: number | null;
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
    ingestExtractedEvent: {
      findUnique: async ({ where }: { where: { venueId_fingerprint: { venueId: string; fingerprint: string } } }) => {
        return (
          extracted.find(
            (item) => item.venueId === where.venueId_fingerprint.venueId && item.fingerprint === where.venueId_fingerprint.fingerprint,
          ) ?? null
        ) as { id: string } | null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ext-${extracted.length + 1}`, ...data };
        extracted.push(row);
        return row;
      },
    },
  };
}

const previousEnabled = process.env.AI_INGEST_ENABLED;
const previousApiKey = process.env.OPENAI_API_KEY;

test.after(() => {
  process.env.AI_INGEST_ENABLED = previousEnabled;
  process.env.OPENAI_API_KEY = previousApiKey;
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
      extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "already", startAt: "2025-01-01T10:00:00.000Z", locationText: "main hall" }], raw: [] }),
    },
  );

  assert.equal(store.extracted.length, 1);

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "already", startAt: "2025-01-01T10:00:00.000Z", locationText: "main hall" }], raw: [] }),
    },
  );

  assert.equal(result.createdCount, 0);
  assert.equal(result.dedupedCount, 1);
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
          extractWithOpenAI: async () => ({ model: "test-model", events: [{ title: "" }], raw: {} }),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      return error.code === "BAD_MODEL_OUTPUT";
    },
  );

  assert.equal(store.runs[0]?.status, "FAILED");
  assert.equal(store.runs[0]?.errorCode, "BAD_MODEL_OUTPUT");
});

test("successful run marks succeeded and creates rows", async () => {
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const store = createStore();
  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store,
      fetchHtml: async () => ({ finalUrl: "https://example.com/events", status: 200, contentType: "text/html", bytes: 200, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        events: [{ title: "Fresh Event", startAt: "2025-03-01T19:00:00.000Z", locationText: "Gallery A", description: "Details" }],
        raw: {},
      }),
    },
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.dedupedCount, 0);
  assert.equal(store.runs[0]?.status, "SUCCEEDED");
  assert.equal(store.extracted.length, 1);
});
