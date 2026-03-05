import test from "node:test";
import assert from "node:assert/strict";
import { extractEventsWithOpenAI } from "@/lib/ingest/openai-extract";

const previousApiKey = process.env.OPENAI_API_KEY;
const previousOpenAiModel = process.env.OPENAI_MODEL;
const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = previousApiKey;
  process.env.OPENAI_MODEL = previousOpenAiModel;
});

test("systemPromptOverride replaces hardcoded extraction lines while keeping dynamic lines", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  let systemPrompt = "";
  global.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
    systemPrompt = body.input?.[0]?.content ?? "";
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
    systemPromptOverride: "Use only this custom prompt.",
    venueContext: { name: "Demo Venue", address: "123 Main" },
  });

  assert.match(systemPrompt, /You are extracting upcoming art events from a venue website\./);
  assert.match(systemPrompt, /Venue name: Demo Venue/);
  assert.match(systemPrompt, /Today's date: \d{4}-\d{2}-\d{2}/);
  assert.match(systemPrompt, /Use only this custom prompt\./);
  assert.doesNotMatch(systemPrompt, /Extract ONLY upcoming events/);
});

test("null systemPromptOverride uses hardcoded extraction lines", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  let systemPrompt = "";
  global.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
    systemPrompt = body.input?.[0]?.content ?? "";
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
    systemPromptOverride: null,
  });

  assert.match(systemPrompt, /Extract ONLY upcoming events/);
  assert.match(systemPrompt, /Return results in the provided schema\./);
});

test("modelOverride takes precedence over params.model and OPENAI_MODEL", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "env-model";

  let requestModel = "";
  global.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    requestModel = body.model ?? "";
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
    model: "param-model",
    modelOverride: "override-model",
  });

  assert.equal(requestModel, "override-model");
});

test("maxOutputTokensOverride is used when provided; default 4000 when omitted", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const tokenValues: number[] = [];
  global.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { max_output_tokens?: number };
    tokenValues.push(body.max_output_tokens ?? -1);
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
    maxOutputTokensOverride: 1234,
  });

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
  });

  assert.deepEqual(tokenValues, [1234, 4000]);
});


test("platformHint appears between date and static lines", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  let systemPrompt = "";
  global.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: Array<{ content?: string }> };
    systemPrompt = body.input?.[0]?.content ?? "";
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
    platformHint: "This is a test platform hint.",
  });

  const dateIdx = systemPrompt.indexOf("Today's date:");
  const hintIdx = systemPrompt.indexOf("This is a test platform hint.");
  const staticIdx = systemPrompt.indexOf("You are extracting structured data from a venue website.");

  assert.ok(dateIdx >= 0);
  assert.ok(hintIdx > dateIdx);
  assert.ok(staticIdx > hintIdx);
});
