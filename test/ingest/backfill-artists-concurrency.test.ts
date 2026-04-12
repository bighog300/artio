import test from "node:test";
import assert from "node:assert/strict";
import { handleBackfillArtistsCron, runWithConcurrency } from "@/lib/cron-ingest-backfill-artists";

test("runWithConcurrency processes all items", async () => {
  const seen: number[] = [];
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    seen.push(item);
  });
  assert.equal(seen.length, 5);
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("runWithConcurrency continues when worker callback throws", async () => {
  const seen: number[] = [];
  await runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
    if (item % 2 === 0) throw new Error("boom");
    seen.push(item);
  });
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 3]);
});

test("backfill artist cron enforces search quota soft limit", async () => {
  const previousFlag = process.env.AI_ARTIST_INGEST_ENABLED;
  process.env.AI_ARTIST_INGEST_ENABLED = "1";

  let discoverCalls = 0;
  const names = Array.from({ length: 85 }, (_, idx) => `Artist ${idx + 1}`);

  const response = await handleBackfillArtistsCron(
    new Request("https://example.com/api/cron/ingest/backfill-artists?limit=1", { method: "GET" }),
    {
      db: {
        ingestExtractedEvent: {
          findMany: async () => [
            {
              id: "extracted-event-1",
              artistNames: names,
              title: "Big Group Show",
              createdEventId: "event-1",
            },
          ],
        },
        eventArtist: {
          findMany: async () => [],
        },
        siteSettings: {
          findUnique: async () => ({
            googlePseApiKey: "pse",
            googlePseCx: "cx",
            artistLookupProvider: null,
            artistBioProvider: null,
            geminiApiKey: null,
            anthropicApiKey: null,
            openAiApiKey: null,
          }),
        },
      },
      discoverArtist: async () => {
        discoverCalls += 1;
        return { status: "created" };
      },
      extractCronSecret: () => "secret",
      validateCronRequest: () => null,
      tryAcquireCronLock: async () => ({ acquired: true, release: async () => {}, supported: true }),
      createCronRunId: () => "run-1",
      logCronSummary: () => {},
      now: () => Date.now(),
    } as never,
  );

  process.env.AI_ARTIST_INGEST_ENABLED = previousFlag;

  const body = await response.json() as { discovered: number; failed: number };
  assert.equal(discoverCalls, 80);
  assert.equal(body.discovered, 80);
  assert.equal(body.failed, 5);
});
