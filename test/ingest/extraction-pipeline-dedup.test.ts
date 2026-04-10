import test from "node:test";
import assert from "node:assert/strict";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";

test("batched fingerprint lookup dedupes in one query and keeps non-matches", async () => {
  const previousEnabled = process.env.AI_INGEST_ENABLED;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.AI_INGEST_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const findManyCalls: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];

  const store = {
    ingestRun: {
      create: async ({ data }: { data: { venueId: string; sourceUrl: string; status: string; startedAt: Date } }) => ({
        id: "run-1",
        ...data,
      }),
      update: async () => ({}),
    },
    ingestExtractedEvent: {
      findUnique: async () => null,
      findMany: async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        findManyCalls.push({ where, select });
        if ("fingerprint" in where) {
          const values = ((where.fingerprint as { in?: string[] }).in ?? []);
          return values.length > 1 ? [{ fingerprint: values[1] }] : [];
        }
        return [];
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `ext-${created.length}`, ...data };
      },
      update: async () => ({}),
    },
    venue: {
      findUnique: async () => ({ country: "US", lat: null, lng: null, name: "Venue", addressLine1: null, city: null, eventsPageUrl: null }),
      update: async () => ({}),
    },
    siteSettings: {
      findUnique: async () => null,
    },
  };

  const result = await runVenueIngestExtraction(
    { venueId: "venue-1", sourceUrl: "https://example.com" },
    {
      store: store as never,
      fetchHtml: async () => ({ finalUrl: "https://example.com", status: 200, contentType: "text/html", bytes: 100, html: "<html></html>" }),
      extractWithOpenAI: async () => ({
        model: "test-model",
        raw: { events: [] },
        venueSnapshot: {},
        events: [
          { title: "Event A", startAt: "2026-06-01T19:00:00.000Z", locationText: "Hall A" },
          { title: "Event B", startAt: "2026-06-02T19:00:00.000Z", locationText: "Hall B" },
          { title: "Event C", startAt: "2026-06-03T19:00:00.000Z", locationText: "Hall C" },
        ],
      }),
    },
  );

  process.env.AI_INGEST_ENABLED = previousEnabled;
  process.env.OPENAI_API_KEY = previousApiKey;

  const fingerprintBatchCall = findManyCalls.find((call) => "fingerprint" in (call.where as Record<string, unknown>));
  assert.ok(fingerprintBatchCall);
  const queriedFingerprints = ((fingerprintBatchCall!.where as { fingerprint: { in: string[] } }).fingerprint.in);
  assert.equal(queriedFingerprints.length, 3);

  assert.equal(result.dedupedCount, 1);
  assert.equal(result.createdCount + result.createdDuplicateCount, 2);
  assert.equal(created.length, 2);
});
