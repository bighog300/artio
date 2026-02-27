import test from "node:test";
import assert from "node:assert/strict";
import { runCronIngestVenues } from "../lib/cron-ingest-venues.ts";

type MockRun = { venueId: string; createdAt: Date; status: "RUNNING" | "SUCCEEDED" | "FAILED"; errorCode?: string | null };

function createDb(venues: Array<{ id: string; websiteUrl: string | null }>, runs: MockRun[] = [], lockAcquired = true) {
  return {
    venue: {
      findMany: async () => venues,
    },
    ingestRun: {
      findFirst: async (args: { where: { venueId: string; status: { in: Array<"RUNNING" | "SUCCEEDED"> } } }) => {
        const latest = runs
          .filter((run) => run.venueId === args.where.venueId && args.where.status.in.includes(run.status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return latest ? { createdAt: latest.createdAt } : null;
      },
      findMany: async (args: { where: { createdAt: { gte: Date } }; select: { status?: true; errorCode?: true } }) => {
        const filtered = runs.filter((run) => run.createdAt >= args.where.createdAt.gte);
        return filtered.map((run) => ({
          ...(args.select.status ? { status: run.status } : {}),
          ...(args.select.errorCode ? { errorCode: run.errorCode ?? null } : {}),
        }));
      },
    },
    $queryRaw: async () => [{ locked: lockAcquired }],
  };
}

test("cron ingest venues rejects unauthorized requests", async () => {
  process.env.CRON_SECRET = "expected";
  process.env.AI_INGEST_ENABLED = "1";

  const response = await runCronIngestVenues("wrong", {}, createDb([]));
  assert.equal(response.status, 401);
});

test("cron ingest venues skips when AI ingest is disabled", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "0";

  const response = await runCronIngestVenues("secret", {}, createDb([]));
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.skipped, true);
  assert.equal(body.reason, "ingest_disabled");
});

test("cron ingest venues skips when lock is not acquired", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";

  const response = await runCronIngestVenues("secret", {}, createDb([], [], false));
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.reason, "lock_not_acquired");
});

test("cron ingest venues dryRun lists venues without running extraction", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";

  const runCalls: Array<{ venueId: string; sourceUrl: string }> = [];
  const response = await runCronIngestVenues(
    "secret",
    { dryRun: "1", limit: "2", minHoursSinceLastRun: "24" },
    createDb(
      [
        { id: "venue-a", websiteUrl: "https://a.example" },
        { id: "venue-b", websiteUrl: "https://b.example" },
      ],
      [],
    ),
    {},
    {
      runExtraction: async (params) => {
        runCalls.push(params);
        return { runId: "run-1", createdCount: 1, dedupedCount: 0 };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.dryRun, true);
  assert.equal(body.wouldRun, 2);
  assert.equal(body.runCount, 0);
  assert.equal(runCalls.length, 0);
  assert.equal(body.venues.length, 2);
  assert.equal(body.venues[0].status, "would_run");
});

test("cron ingest venues runs extraction with expected payload", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";

  const calls: Array<{ venueId: string; sourceUrl: string }> = [];
  const response = await runCronIngestVenues(
    "secret",
    { limit: "1", minHoursSinceLastRun: "24" },
    createDb([{ id: "venue-1", websiteUrl: "https://venue.one" }]),
    {},
    {
      runExtraction: async (params) => {
        calls.push(params);
        return { runId: "run-abc", createdCount: 3, dedupedCount: 2 };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.runCount, 1);
  assert.equal(body.succeeded, 1);
  assert.equal(body.createdCandidates, 3);
  assert.equal(body.dedupedCandidates, 2);
  assert.deepEqual(calls, [{ venueId: "venue-1", sourceUrl: "https://venue.one" }]);
});

test("circuit breaker opens when failure rate threshold exceeded", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";
  process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS = "5";
  process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE = "0.6";

  const now = Date.now();
  const runs: MockRun[] = [
    { venueId: "v1", createdAt: new Date(now - 1000), status: "FAILED" },
    { venueId: "v2", createdAt: new Date(now - 2000), status: "FAILED" },
    { venueId: "v3", createdAt: new Date(now - 3000), status: "FAILED" },
    { venueId: "v4", createdAt: new Date(now - 4000), status: "FAILED" },
    { venueId: "v5", createdAt: new Date(now - 5000), status: "SUCCEEDED" },
  ];

  const response = await runCronIngestVenues("secret", {}, createDb([{ id: "venue-1", websiteUrl: "https://a.example" }], runs));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.skipped, true);
  assert.equal(body.reason, "circuit_breaker_open");
  assert.equal(body.circuitBreaker.open, true);
});


test("cron stops early when created candidates cap reached", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";
  process.env.AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES = "5";

  let calls = 0;
  const response = await runCronIngestVenues(
    "secret",
    { limit: "3" },
    createDb([
      { id: "venue-1", websiteUrl: "https://v1.example" },
      { id: "venue-2", websiteUrl: "https://v2.example" },
      { id: "venue-3", websiteUrl: "https://v3.example" },
    ]),
    {},
    {
      runExtraction: async () => {
        calls += 1;
        return { runId: `run-${calls}`, createdCount: 5, dedupedCount: 0 };
      },
    },
  );

  const body = await response.json();
  assert.equal(body.stopReason, "CRON_TOTAL_CAP_REACHED");
  assert.equal(calls, 1);
});

test("cron stops early when time budget exceeded", async () => {
  process.env.CRON_SECRET = "secret";
  process.env.AI_INGEST_ENABLED = "1";
  process.env.AI_INGEST_CRON_TIME_BUDGET_MS = "50";

  let tick = 0;
  const nowFn = () => {
    tick += 60;
    return 1_000_000 + tick;
  };

  const response = await runCronIngestVenues(
    "secret",
    { limit: "2" },
    createDb([
      { id: "venue-1", websiteUrl: "https://v1.example" },
      { id: "venue-2", websiteUrl: "https://v2.example" },
    ]),
    {},
    {
      now: nowFn,
      runExtraction: async () => ({ runId: "run-1", createdCount: 1, dedupedCount: 0 }),
    },
  );

  const body = await response.json();
  assert.equal(body.stopReason, "TIME_BUDGET_EXCEEDED");
});
