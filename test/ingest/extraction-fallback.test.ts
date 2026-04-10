import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { IngestError } from "@/lib/ingest/errors";
import type { ExtractionProvider } from "@/lib/ingest/providers";
import { extractWithFallback, resolveFallbackProviderName } from "@/lib/ingest/extraction-pipeline";

const baseParams = {
  html: "<html></html>",
  sourceUrl: "https://example.com",
  systemPrompt: "prompt",
  jsonSchema: {},
  model: "model-x",
  apiKey: "primary-key",
  maxOutputTokens: 1000,
};

test("extractWithFallback returns primary result when primary succeeds", async () => {
  const primaryProvider: ExtractionProvider = {
    name: "openai",
    extract: async () => ({ raw: { events: [] }, model: "primary-model", usage: { totalTokens: 10 } }),
  };

  const result = await extractWithFallback({
    primaryProvider,
    primaryApiKey: "primary-key",
    fallbackProviderName: "claude",
    fallbackApiKey: "fallback-key",
    extractParams: baseParams,
    getProviderFn: () => {
      throw new Error("fallback should not be called");
    },
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.extractionProvider, "openai");
  assert.equal(result.model, "primary-model");
});

test("extractWithFallback retries retryable error with fallback provider", async () => {
  const primaryProvider: ExtractionProvider = {
    name: "openai",
    extract: async () => {
      throw new IngestError("RATE_LIMITED", "rate limited");
    },
  };
  let fallbackCalled = false;
  const fallbackProvider: ExtractionProvider = {
    name: "claude",
    extract: async (params) => {
      fallbackCalled = true;
      assert.equal(params.apiKey, "fallback-key");
      assert.equal(params.model, "");
      return { raw: { events: [{ title: "Fallback Event" }] }, model: "fallback-model", usage: { totalTokens: 20 } };
    },
  };

  const warnMock = mock.method(console, "warn", () => {});

  const result = await extractWithFallback({
    primaryProvider,
    primaryApiKey: "primary-key",
    fallbackProviderName: "claude",
    fallbackApiKey: "fallback-key",
    extractParams: baseParams,
    getProviderFn: () => fallbackProvider,
  });

  assert.equal(fallbackCalled, true);
  assert.equal(result.usedFallback, true);
  assert.equal(result.extractionProvider, "claude");
  assert.equal(result.model, "fallback-model");
  assert.equal(warnMock.mock.calls.length, 1);
  assert.equal(warnMock.mock.calls[0]?.arguments[0], "extraction_primary_failed_using_fallback");
  warnMock.mock.restore();
});

test("extractWithFallback re-throws non-retryable errors", async () => {
  const primaryProvider: ExtractionProvider = {
    name: "openai",
    extract: async () => {
      throw new IngestError("CONFIG_ERROR", "bad config");
    },
  };

  await assert.rejects(
    () =>
      extractWithFallback({
        primaryProvider,
        primaryApiKey: "primary-key",
        fallbackProviderName: "claude",
        fallbackApiKey: "fallback-key",
        extractParams: baseParams,
        getProviderFn: () => {
          throw new Error("fallback should not be called");
        },
      }),
    (error: unknown) => error instanceof IngestError && error.code === "CONFIG_ERROR",
  );
});

test("extractWithFallback re-throws retryable error when fallback key missing", async () => {
  const primaryProvider: ExtractionProvider = {
    name: "openai",
    extract: async () => {
      throw new IngestError("TOKEN_LIMIT", "token limit");
    },
  };

  await assert.rejects(
    () =>
      extractWithFallback({
        primaryProvider,
        primaryApiKey: "primary-key",
        fallbackProviderName: "claude",
        fallbackApiKey: null,
        extractParams: baseParams,
        getProviderFn: () => {
          throw new Error("fallback should not be called");
        },
      }),
    (error: unknown) => error instanceof IngestError && error.code === "TOKEN_LIMIT",
  );
});

test("extractWithFallback propagates fallback provider error", async () => {
  const primaryProvider: ExtractionProvider = {
    name: "openai",
    extract: async () => {
      throw new IngestError("RATE_LIMITED", "primary rate limited");
    },
  };
  const fallbackProvider: ExtractionProvider = {
    name: "claude",
    extract: async () => {
      throw new IngestError("PROVIDER_ERROR", "fallback failed");
    },
  };

  await assert.rejects(
    () =>
      extractWithFallback({
        primaryProvider,
        primaryApiKey: "primary-key",
        fallbackProviderName: "claude",
        fallbackApiKey: "fallback-key",
        extractParams: baseParams,
        getProviderFn: () => fallbackProvider,
      }),
    (error: unknown) => error instanceof IngestError && error.message.includes("fallback failed"),
  );
});

test("resolveFallbackProviderName maps configured fallbacks", () => {
  assert.equal(resolveFallbackProviderName("claude"), "openai");
  assert.equal(resolveFallbackProviderName("openai"), "claude");
  assert.equal(resolveFallbackProviderName("gemini"), "openai");
  assert.equal(resolveFallbackProviderName("unknown"), null);
});
