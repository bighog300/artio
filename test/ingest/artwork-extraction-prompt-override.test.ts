import test from "node:test";
import assert from "node:assert/strict";
import { extractArtworksForEvent, DEFAULT_ARTWORK_SYSTEM_PROMPT } from "@/lib/ingest/artwork-extraction";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

function createDb(artworkExtractionSystemPrompt: string | null) {
  return {
    siteSettings: {
      findUnique: async () => ({
        regionAutoPublishArtworks: false,
        artworkExtractionSystemPrompt,
      }),
    },
    ingestExtractedArtwork: {
      findUnique: async () => null,
      create: async () => ({ id: "candidate-1" }),
    },
  };
}

test("uses siteSettings artwork prompt override", async () => {
  let capturedSystemPrompt = "";

  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
      capturedSystemPrompt = body.input?.[0]?.content ?? "";
      return new Response(JSON.stringify({ output_parsed: { artworks: [] } }), { status: 200 });
    }

    return new Response("<html><body>Test</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await extractArtworksForEvent({
    db: createDb("Custom artwork prompt") as never,
    eventId: "event-1",
    sourceUrl: "https://example.com/event",
    settings: { artworkExtractionProvider: "openai", openAiApiKey: "key" },
  });

  assert.equal(capturedSystemPrompt, "Custom artwork prompt");
});

test("uses explicit system prompt override over site settings", async () => {
  let capturedSystemPrompt = "";

  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
      capturedSystemPrompt = body.input?.[0]?.content ?? "";
      return new Response(JSON.stringify({ output_parsed: { artworks: [] } }), { status: 200 });
    }

    return new Response("<html><body>Test</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await extractArtworksForEvent({
    db: createDb("Custom artwork prompt") as never,
    eventId: "event-1",
    sourceUrl: "https://example.com/event",
    systemPromptOverride: "Artist profile prompt",
    settings: { artworkExtractionProvider: "openai", openAiApiKey: "key" },
  });

  assert.equal(capturedSystemPrompt, "Artist profile prompt");
});

test("uses default artwork prompt when override is null", async () => {
  let capturedSystemPrompt = "";

  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.openai.com/v1/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
      capturedSystemPrompt = body.input?.[0]?.content ?? "";
      return new Response(JSON.stringify({ output_parsed: { artworks: [] } }), { status: 200 });
    }

    return new Response("<html><body>Test</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  await extractArtworksForEvent({
    db: createDb(null) as never,
    eventId: "event-1",
    sourceUrl: "https://example.com/event",
    settings: { artworkExtractionProvider: "openai", openAiApiKey: "key" },
  });

  assert.equal(capturedSystemPrompt, DEFAULT_ARTWORK_SYSTEM_PROMPT);
});
