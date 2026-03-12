import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { handleVenueGenerationPost } from "../lib/venue-generation/admin-venue-generation-handler";

test("venue generation handler awaits durable job dispatch with expected params", async () => {
  const req = new NextRequest("http://localhost/api/admin/venue-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country: "South Africa", region: "Western Cape" }),
  });

  const calls: Array<{ name: string; options: unknown }> = [];
  const res = await handleVenueGenerationPost(req, {
    requireAdminFn: async () => ({ id: "admin-1", email: "admin@example.com" }) as never,
    parseBodyFn: async () => ({ country: "South Africa", region: "Western Cape" }) as never,
    createOpenAiClientFn: async () => ({}) as never,
    runVenueGenerationPhase1Fn: async () => ({
      runId: "run_123",
      totalReturned: 1,
      totalCreated: 1,
      totalSkipped: 0,
    }) as never,
    runJobFn: async (name, options) => {
      calls.push({ name, options });
      return { id: "job_1" } as never;
    },
    dbClient: {} as never,
    openAiApiKey: "test-key",
  });

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    name: "venue.generation.process-run",
    options: {
      trigger: "admin",
      actorEmail: "admin@example.com",
      params: { runId: "run_123" },
    },
  });
});

test("venue generation handler returns 500 when job dispatch fails", async () => {
  const req = new NextRequest("http://localhost/api/admin/venue-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country: "South Africa", region: "Western Cape" }),
  });

  const res = await handleVenueGenerationPost(req, {
    requireAdminFn: async () => ({ id: "admin-1", email: "admin@example.com" }) as never,
    parseBodyFn: async () => ({ country: "South Africa", region: "Western Cape" }) as never,
    createOpenAiClientFn: async () => ({}) as never,
    runVenueGenerationPhase1Fn: async () => ({
      runId: "run_123",
      totalReturned: 1,
      totalCreated: 1,
      totalSkipped: 0,
    }) as never,
    runJobFn: async () => {
      throw new Error("dispatch failed");
    },
    dbClient: {} as never,
    openAiApiKey: "test-key",
  });

  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.error?.code, "internal_error");
});

test("admin venue generation handler has no fire-and-forget runJob call", async () => {
  const source = await readFile("lib/venue-generation/admin-venue-generation-handler.ts", "utf8");
  assert.equal(source.includes("void runJobFn("), false);
});
