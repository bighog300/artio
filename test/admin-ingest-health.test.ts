import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminIngestHealth } from "../lib/admin-ingest-route";

function createReq() {
  return new NextRequest("http://localhost/api/admin/ingest/health");
}

test("health endpoint requires editor auth", async () => {
  const response = await handleAdminIngestHealth(createReq(), {
    requireEditorUser: async () => {
      throw new Error("unauthorized");
    },
  });

  assert.equal(response.status, 401);
});

test("health endpoint returns aggregate shape", async () => {
  const now = Date.now();
  const runs = [
    {
      id: "run-1",
      createdAt: new Date(now - 60_000),
      venueId: "venue-1",
      venue: { id: "venue-1", name: "Venue One" },
      status: "SUCCEEDED",
      createdCandidates: 4,
      dedupedCandidates: 1,
      durationMs: 1200,
      errorCode: null,
    },
    {
      id: "run-2",
      createdAt: new Date(now - 120_000),
      venueId: "venue-2",
      venue: { id: "venue-2", name: "Venue Two" },
      status: "FAILED",
      createdCandidates: 0,
      dedupedCandidates: 0,
      durationMs: 800,
      errorCode: "BAD_MODEL_OUTPUT",
    },
  ];

  const appDb = {
    ingestRun: {
      findMany: async (args: { select?: Record<string, boolean>; include?: { venue: { select: { id: true; name: true } } } }) => {
        if (args.include) return runs;
        if (args.select?.errorCode) return runs.map((run) => ({ status: run.status, errorCode: run.errorCode }));
        return runs.map((run) => ({
          status: run.status,
          errorCode: run.errorCode,
          createdCandidates: run.createdCandidates,
          durationMs: run.durationMs,
        }));
      },
    },
  };

  const response = await handleAdminIngestHealth(createReq(), {
    requireEditorUser: async () => ({ id: "u1", email: "editor@example.com", role: "EDITOR" }),
    appDb: appDb as never,
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.last7Days.totalRuns, 2);
  assert.equal(body.last7Days.succeeded, 1);
  assert.equal(body.last7Days.failed, 1);
  assert.equal(Array.isArray(body.last24hRuns), true);
  assert.equal(body.last24hRuns.length, 2);
  assert.equal(typeof body.circuitBreaker.open, "boolean");
  assert.equal(body.last7Days.topErrorCodes[0].errorCode, "BAD_MODEL_OUTPUT");
});
