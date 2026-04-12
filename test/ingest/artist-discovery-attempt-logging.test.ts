import test from "node:test";
import assert from "node:assert/strict";
import { discoverArtist } from "@/lib/ingest/artist-discovery";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

function createDbWithRunSpy(runCreates: Array<{ data: Record<string, unknown> }>) {
  const tx = {
    ingestExtractedArtist: {
      findFirst: async () => null,
      create: async () => ({ id: "candidate-1" }),
    },
    ingestExtractedArtistRun: {
      create: async (args: { data: Record<string, unknown> }) => {
        runCreates.push(args);
        return { id: "run-1" };
      },
    },
    ingestExtractedArtistEvent: { create: async () => ({ id: "link-1" }) },
  };

  return {
    artist: { findFirst: async () => null },
    eventArtist: { upsert: async () => null },
    ingestExtractedArtist: {
      findFirst: async () => null,
      create: async () => ({ id: "candidate-1" }),
    },
    ingestExtractedArtistRun: {
      create: async (args: { data: Record<string, unknown> }) => {
        runCreates.push(args);
        return { id: "run-1" };
      },
    },
    ingestExtractedArtistEvent: {
      upsert: async () => null,
      create: async () => ({ id: "link-1" }),
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
    siteSettings: { findUnique: async () => ({ regionAutoPublishArtists: false }) },
  };
}

test("discoverArtist writes successful attempt run metadata", async () => {
  const runCreates: Array<{ data: Record<string, unknown> }> = [];

  global.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      return new Response(
        JSON.stringify({
          output_parsed: {
            name: "Test Artist",
            bio: "Bio",
            mediums: ["painting"],
            websiteUrl: "https://artist.example",
            instagramUrl: null,
            twitterUrl: null,
            nationality: null,
            birthYear: null,
          },
          usage: { total_tokens: 12 },
          model: "gpt-4.1-mini",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("googleapis.com/customsearch")) {
      return new Response(
        JSON.stringify({
          items: [{ link: "https://artist.example", title: "Test Artist", snippet: "Snippet" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response("<html><body>Artist</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await discoverArtist({
    db: createDbWithRunSpy(runCreates) as never,
    artistName: "Test Artist",
    eventId: "event-1",
    settings: {
      artistBioProvider: "openai",
      openAiApiKey: "key",
      googlePseApiKey: "pse",
      googlePseCx: "cx",
    },
  });

  assert.equal(runCreates.length, 1);
  assert.equal(runCreates[0]?.data.errorCode, null);
  assert.equal(runCreates[0]?.data.errorMessage, null);
  assert.equal(typeof runCreates[0]?.data.durationMs, "number");
  assert.equal((runCreates[0]?.data.durationMs as number) >= 0, true);
  assert.ok(runCreates[0]?.data.attemptedAt instanceof Date);
});

test("discoverArtist writes failed attempt run metadata when model extraction fails", async () => {
  const runCreates: Array<{ data: Record<string, unknown> }> = [];

  global.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      throw new Error("upstream timeout");
    }

    if (url.includes("googleapis.com/customsearch")) {
      return new Response(
        JSON.stringify({
          items: [{ link: "https://artist.example", title: "Test Artist", snippet: "Snippet" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response("<html><body>Artist</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await discoverArtist({
    db: createDbWithRunSpy(runCreates) as never,
    artistName: "Test Artist",
    eventId: "event-1",
    settings: {
      artistBioProvider: "openai",
      openAiApiKey: "key",
      googlePseApiKey: "pse",
      googlePseCx: "cx",
    },
  });

  assert.equal(runCreates.length, 1);
  assert.equal(runCreates[0]?.data.errorCode, "model_failed");
  assert.equal(runCreates[0]?.data.errorMessage, "upstream timeout");
  assert.equal(typeof runCreates[0]?.data.durationMs, "number");
  assert.ok(runCreates[0]?.data.attemptedAt instanceof Date);
});
