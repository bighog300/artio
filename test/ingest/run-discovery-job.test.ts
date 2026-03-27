import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { runDiscoveryJob } from "../../lib/ingest/run-discovery-job";

test("runDiscoveryJob dedups known venues by canonicalUrl and stores candidate canonicalUrl", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => new Response(
      JSON.stringify({
        items: [
          {
            link: "http://www.Example.com/path/?utm_source=google",
            title: "Example",
            snippet: "Snippet",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    const venueFindFirstCalls: unknown[] = [];
    const candidateCreates: Array<{ data: Record<string, unknown> }> = [];

    const db = {
      ingestDiscoveryJob: {
        async findUnique() {
          return {
            id: "job-1",
            status: "PENDING",
            queryTemplate: "live music [region]",
            region: "Berlin",
            maxResults: 5,
            searchProvider: "google_pse",
            entityType: "VENUE",
          };
        },
        async update() {
          return null;
        },
      },
      venue: {
        async findFirst(args: unknown) {
          venueFindFirstCalls.push(args);
          return { id: "venue-1" };
        },
      },
      artist: {
        async findFirst() {
          return null;
        },
      },
      ingestDiscoveryCandidate: {
        async create(args: { data: Record<string, unknown> }) {
          candidateCreates.push(args);
          return null;
        },
        async findFirst() {
          return null;
        },
      },
    } as unknown as PrismaClient;

    const result = await runDiscoveryJob({
      db,
      jobId: "job-1",
      env: { googlePseApiKey: "key", googlePseCx: "cx" },
    });

    assert.equal(result.queued, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(venueFindFirstCalls, [
      {
        where: {
          OR: [
            { canonicalUrl: "https://example.com/path" },
            { websiteUrl: "http://www.Example.com/path/?utm_source=google" },
          ],
        },
        select: { id: true },
      },
    ]);
    assert.equal(candidateCreates[0]?.data.canonicalUrl, "https://example.com/path");
  } finally {
    global.fetch = originalFetch;
  }
});

test("runDiscoveryJob writes completion metrics for queued and skipped candidates", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => new Response(
      JSON.stringify({
        items: [
          { link: "https://new-one.example", title: "New One", snippet: "a" },
          { link: "https://known.example", title: "Known", snippet: "b" },
          { link: "https://new-one.example", title: "Duplicate", snippet: "c" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    const jobUpdates: Array<{ data: Record<string, unknown> }> = [];

    const db = {
      ingestDiscoveryJob: {
        async findUnique() {
          return {
            id: "job-1",
            status: "PENDING",
            queryTemplate: "live music [region]",
            region: "Berlin",
            maxResults: 5,
            searchProvider: "google_pse",
            entityType: "VENUE",
          };
        },
        async update(args: { data: Record<string, unknown> }) {
          jobUpdates.push(args);
          return null;
        },
      },
      venue: {
        async findFirst(args: { where: { OR?: Array<{ canonicalUrl?: string; websiteUrl?: string }>; websiteUrl?: string } }) {
          const canonical = args.where.OR?.find((entry) => typeof entry.canonicalUrl === "string")?.canonicalUrl;
          if (canonical === "https://known.example") return { id: "venue-1" };
          return null;
        },
      },
      artist: { async findFirst() { return null; } },
      ingestDiscoveryCandidate: {
        async create() { return null; },
        async findFirst(args: { where: { OR?: Array<{ canonicalUrl?: string; url?: string }>; url?: string } }) {
          const canonical = args.where.OR?.find((entry) => typeof entry.canonicalUrl === "string")?.canonicalUrl;
          if (canonical === "https://new-one.example") return { id: "existing-dup" };
          return null;
        },
      },
    } as unknown as PrismaClient;

    const result = await runDiscoveryJob({
      db,
      jobId: "job-1",
      env: { googlePseApiKey: "key", googlePseCx: "cx" },
    });

    assert.equal(result.queued, 0);
    assert.equal(result.skipped, 3);

    const doneUpdate = jobUpdates.at(-1)?.data;
    assert.equal(doneUpdate?.status, "DONE");
    assert.equal(doneUpdate?.candidatesQueued, 0);
    assert.equal(doneUpdate?.candidatesSkipped, 3);
    assert.equal(doneUpdate?.queryFailCount, 0);
    assert.equal(typeof doneUpdate?.durationMs, "number");
    assert.equal((doneUpdate?.durationMs as number) >= 0, true);
  } finally {
    global.fetch = originalFetch;
  }
});
