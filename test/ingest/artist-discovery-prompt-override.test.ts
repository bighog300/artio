import test from "node:test";
import assert from "node:assert/strict";
import { discoverArtist, DEFAULT_ARTIST_BIO_SYSTEM_PROMPT } from "@/lib/ingest/artist-discovery";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

function createDb() {
  const tx = {
    ingestExtractedArtist: {
      findFirst: async () => null,
      create: async () => ({ id: "candidate-1" }),
    },
    ingestExtractedArtistRun: { create: async () => ({ id: "run-1" }) },
    ingestExtractedArtistEvent: { create: async () => ({ id: "link-1" }) },
  };

  return {
    artist: { findFirst: async () => null },
    eventArtist: { upsert: async () => null },
    ingestExtractedArtist: {
      findFirst: async () => null,
      create: async () => ({ id: "candidate-1" }),
    },
    ingestExtractedArtistRun: { create: async () => ({ id: "run-1" }) },
    ingestExtractedArtistEvent: {
      upsert: async () => null,
      create: async () => ({ id: "link-1" }),
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
    siteSettings: { findUnique: async () => ({ regionAutoPublishArtists: false }) },
  };
}

test("uses artist bio prompt override", async () => {
  let capturedSystemPrompt = "";

  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
      capturedSystemPrompt = body.input?.[0]?.content ?? "";
      return new Response(JSON.stringify({ output_parsed: {} }), { status: 200 });
    }

    return new Response("<html><body>Artist</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await discoverArtist({
    db: createDb() as never,
    artistName: "Test Artist",
    eventId: "event-1",
    settings: {
      artistBioProvider: "openai",
      openAiApiKey: "key",
      artistBioSystemPrompt: "Custom artist prompt",
    },
  });

  assert.equal(capturedSystemPrompt, "Custom artist prompt");
});

test("uses default artist bio prompt when override is null", async () => {
  let capturedSystemPrompt = "";

  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
      capturedSystemPrompt = body.input?.[0]?.content ?? "";
      return new Response(JSON.stringify({ output_parsed: {} }), { status: 200 });
    }

    return new Response("<html><body>Artist</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await discoverArtist({
    db: createDb() as never,
    artistName: "Test Artist",
    eventId: "event-1",
    settings: {
      artistBioProvider: "openai",
      openAiApiKey: "key",
      artistBioSystemPrompt: null,
    },
  });

  assert.equal(capturedSystemPrompt, DEFAULT_ARTIST_BIO_SYSTEM_PROMPT);
});
