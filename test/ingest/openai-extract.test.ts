import test from "node:test";
import assert from "node:assert/strict";
import { extractEventsWithOpenAI } from "@/lib/ingest/openai-extract";
import { IngestError } from "@/lib/ingest/errors";

const previousApiKey = process.env.OPENAI_API_KEY;
const previousOpenAiModel = process.env.OPENAI_MODEL;
const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = previousApiKey;
  process.env.OPENAI_MODEL = previousOpenAiModel;
});

test("extractEventsWithOpenAI reads structured JSON output without parsing output_text", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = (async () => new Response(JSON.stringify({
    output_parsed: {
      venueDescription: null,
      venueCoverImageUrl: null,
      venueOpeningHours: null,
      venueContactEmail: null,
      venueInstagramUrl: null,
      venueFacebookUrl: null,
      events: [
        {
          title: "Opening Night",
          startAt: "2026-06-10T19:00:00.000Z",
          endAt: null,
          timezone: "America/Chicago",
          locationText: "Main Hall",
          description: null,
          sourceUrl: "https://example.com/events/opening-night",
        },
      ],
    },
    usage: {
      input_tokens: 123,
      output_tokens: 45,
      total_tokens: 168,
    },
  }), { status: 200 })) as typeof fetch;

  const result = await extractEventsWithOpenAI({
    html: "<html><body><h1>Opening Night</h1></body></html>",
    sourceUrl: "https://example.com",
    model: "gpt-4o-mini",
  });

  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.title, "Opening Night");
  assert.deepEqual(result.raw, {
    venueDescription: null,
    venueCoverImageUrl: null,
    venueOpeningHours: null,
    venueContactEmail: null,
    venueInstagramUrl: null,
    venueFacebookUrl: null,
    events: [
      {
        title: "Opening Night",
        startAt: "2026-06-10T19:00:00.000Z",
        endAt: null,
        timezone: "America/Chicago",
        locationText: "Main Hall",
        description: null,
        sourceUrl: "https://example.com/events/opening-night",
      },
    ],
  });
  assert.deepEqual(result.usage, {
    promptTokens: 123,
    completionTokens: 45,
    totalTokens: 168,
  });
});

test("extractEventsWithOpenAI throws BAD_MODEL_OUTPUT for invalid structured JSON shape", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = (async () => new Response(JSON.stringify({
    output: [
      {
        content: [{ type: "output_json", json: { events: [{ title: "" }] } }],
      },
    ],
  }), { status: 200 })) as typeof fetch;

  await assert.rejects(
    () =>
      extractEventsWithOpenAI({
        html: "<html><body>Bad output</body></html>",
        sourceUrl: "https://example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      return error.code === "BAD_MODEL_OUTPUT";
    },
  );
});


test("extractEventsWithOpenAI parses JSON from output_text fallback", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = (async () => new Response(JSON.stringify({
    output_text: '{"events":[{"title":"Test"}],"venueDescription":null,"venueCoverImageUrl":null,"venueOpeningHours":null,"venueContactEmail":null,"venueInstagramUrl":null,"venueFacebookUrl":null}',
  }), { status: 200 })) as typeof fetch;

  const result = await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.title, "Test");
});

test("extractEventsWithOpenAI returns debug signature when no valid JSON is found", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = (async () => new Response(JSON.stringify({
    output: [
      {
        content: [{ type: "output_text", text: "not json" }],
      },
    ],
  }), { status: 200 })) as typeof fetch;

  await assert.rejects(
    () =>
      extractEventsWithOpenAI({
        html: "<html><body>Bad output</body></html>",
        sourceUrl: "https://example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      assert.equal(error.code, "BAD_MODEL_OUTPUT");
      const debug = error.meta?.debug as Record<string, unknown> | undefined;
      assert.ok(debug);
      assert.equal(typeof debug?.has_output_parsed, "boolean");
      assert.equal(typeof debug?.output_item_count, "number");
      assert.ok(Array.isArray(debug?.content_types));
      assert.equal(typeof debug?.has_output_text, "boolean");
      assert.ok(debug?.output_text_length === null || typeof debug?.output_text_length === "number");
      return true;
    },
  );
});

test("extractEventsWithOpenAI uses default model and Responses API request shape", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_MODEL;

  let capturedBody: Record<string, unknown> | null = null;
  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_parsed: { events: [{ title: "Test" }], venueDescription: null, venueCoverImageUrl: null, venueOpeningHours: null, venueContactEmail: null, venueInstagramUrl: null, venueFacebookUrl: null } }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<html><body><h1>Test</h1></body></html>",
    sourceUrl: "https://example.com",
  });

  assert.ok(capturedBody);
  assert.equal(typeof capturedBody.model, "string");
  assert.ok(String(capturedBody.model).trim().length > 0);
  assert.equal(capturedBody.max_output_tokens, 4000);
  const text = capturedBody.text as { format?: { type?: string; name?: string; strict?: boolean; schema?: unknown } } | undefined;
  assert.equal(text?.format?.type, "json_schema");
  assert.equal(text?.format?.name, "event_extraction");
  assert.equal(text?.format?.strict, true);
  assert.ok(text?.format?.schema);
  const schema = text?.format?.schema as {
    required?: string[];
    properties?: {
      venueDescription?: { type?: unknown };
      events?: {
        items?: {
          required?: string[];
          properties?: {
            startAt?: { type?: unknown };
            sourceUrl?: Record<string, unknown>;
          };
        };
      };
    };
  } | undefined;
  assert.deepEqual(schema?.required, ["events", "venueDescription", "venueCoverImageUrl", "venueOpeningHours", "venueContactEmail", "venueInstagramUrl", "venueFacebookUrl"]);
  assert.deepEqual(schema?.properties?.venueDescription?.type, ["string", "null"]);
  const eventItems = schema?.properties?.events?.items;
  assert.ok(Array.isArray(eventItems?.required));
  assert.deepEqual(eventItems?.required, ["title", "startAt", "endAt", "timezone", "locationText", "description", "sourceUrl", "artistNames", "imageUrl"]);
  const startAtType = eventItems?.properties?.startAt?.type;
  assert.ok(Array.isArray(startAtType));
  assert.deepEqual(startAtType, ["string", "null"]);
  assert.equal(schema?.properties?.events?.items?.properties?.sourceUrl?.format, undefined);
  assert.equal(capturedBody.response_format, undefined);

  const input = capturedBody.input;
  assert.ok(Array.isArray(input));
  const firstItem = input[0] as { role?: string; content?: unknown };
  assert.equal(typeof firstItem.role, "string");
  assert.ok(
    typeof firstItem.content === "string"
      || (Array.isArray(firstItem.content)
        && firstItem.content.every((part) => (part as { type?: string }).type === "input_text")),
  );
});




test("extractEventsWithOpenAI calls preprocessHtml before truncation", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  let capturedBody: Record<string, unknown> | null = null;
  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      output_parsed: {
        events: [{ title: "Test" }],
        venueDescription: null,
        venueCoverImageUrl: null,
        venueOpeningHours: null,
        venueContactEmail: null,
        venueInstagramUrl: null,
        venueFacebookUrl: null,
      },
    }), { status: 200 });
  }) as typeof fetch;

  await extractEventsWithOpenAI({
    html: "<div>raw</div>",
    sourceUrl: "https://example.com",
    _preprocessHtml: (html) => `${html} SENTINEL_PREPROCESSED`,
  });

  const input = capturedBody?.input as Array<{ content?: string }> | undefined;
  assert.ok(Array.isArray(input));
  const userMessage = input?.[1]?.content;
  assert.equal(typeof userMessage, "string");
  assert.match(String(userMessage), /SENTINEL_PREPROCESSED/);
});
test("extractEventsWithOpenAI surfaces response_format 400 diagnostics", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const responseFormatError = JSON.stringify({
    error: {
      message: "Unsupported parameter: 'response_format'. In the Responses API, this parameter has moved to 'text.format'.",
      type: "invalid_request_error",
      param: "response_format",
      code: "unsupported_parameter",
    },
  });

  global.fetch = (async () => new Response(responseFormatError, { status: 400 })) as typeof fetch;

  await assert.rejects(
    () =>
      extractEventsWithOpenAI({
        html: "<html><body>Bad response</body></html>",
        sourceUrl: "https://example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      assert.equal(error.code, "FETCH_FAILED");
      assert.equal(error.meta?.status, 400);
      assert.match(String(error.meta?.responseTextPrefix), /Unsupported parameter: 'response_format'/);
      return true;
    },
  );
});

test("extractEventsWithOpenAI surfaces non-ok response diagnostics", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const longBody = `${JSON.stringify({ error: { message: "Missing required parameter: model", type: "invalid_request_error" } })}${"x".repeat(600)}`;
  global.fetch = (async () => new Response(longBody, { status: 400 })) as typeof fetch;

  await assert.rejects(
    () =>
      extractEventsWithOpenAI({
        html: "<html><body>Bad response</body></html>",
        sourceUrl: "https://example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      assert.equal(error.code, "FETCH_FAILED");
      assert.equal(error.meta?.status, 400);
      assert.match(String(error.meta?.responseTextPrefix), /Missing required parameter/);
      assert.equal(error.meta?.requestMaxOutputTokens, 4000);
      assert.equal(error.meta?.requestHasTextFormat, true);
      assert.ok(String(error.meta?.responseTextPrefix).length <= 500);
      return true;
    },
  );
});
