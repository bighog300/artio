"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ProviderName = "openai" | "gemini" | "claude";

type IngestSettingsProps = {
  initial: {
    ingestSystemPrompt: string | null;
    artworkExtractionSystemPrompt: string | null;
    artistBioSystemPrompt: string | null;
    ingestModel: string | null;
    ingestMaxOutputTokens: number | null;
    openAiApiKeySet: boolean;
    geminiApiKeySet: boolean;
    anthropicApiKeySet: boolean;
    googlePseApiKeySet: boolean;
    braveSearchApiKeySet: boolean;
    googlePseCx: string | null;
    eventExtractionProvider: string | null;
    artworkExtractionProvider: string | null;
    artistLookupProvider: string | null;
    artistBioProvider: string | null;
    ingestEnabled: boolean;
    ingestImageEnabled: boolean;
    venueAutoPublish: boolean;
    regionAutoPublishVenues?: boolean;
    regionAutoPublishEvents?: boolean;
    regionAutoPublishArtists?: boolean;
    enrichMatchedArtists?: boolean;
    regionAutoPublishArtworks?: boolean;
    regionDiscoveryEnabled?: boolean;
    regionMaxVenuesPerRun?: number | null;
    venueGenerationModel: string | null;
    ingestMaxCandidatesPerVenueRun: number | null;
    ingestDuplicateSimilarityThreshold: number | null;
    ingestDuplicateLookbackDays: number | null;
    ingestConfidenceHighMin: number | null;
    ingestConfidenceMediumMin: number | null;
    autoTagEnabled: boolean;
    autoTagProvider: string | null;
    autoTagModel: string | null;
  };
};

type AiTestResult = {
  ok: boolean;
  durationMs: number;
  model?: string;
  errorMessage?: string;
  keyConfigured?: boolean;
};

export default function IngestSettingsClient(props: IngestSettingsProps) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [showAnthropicApiKey, setShowAnthropicApiKey] = useState(false);
  const [googlePseApiKey, setGooglePseApiKey] = useState("");
  const [showGooglePseApiKey, setShowGooglePseApiKey] = useState(false);
  const [braveSearchApiKey, setBraveSearchApiKey] = useState("");
  const [showBraveSearchApiKey, setShowBraveSearchApiKey] = useState(false);
  const [googlePseCx, setGooglePseCx] = useState(
    props.initial.googlePseCx ?? "",
  );
  const [eventExtractionProvider, setEventExtractionProvider] =
    useState<ProviderName>(
      (props.initial.eventExtractionProvider as ProviderName | null) ??
        "openai",
    );
  const [artworkExtractionProvider, setArtworkExtractionProvider] =
    useState<ProviderName>(
      (props.initial.artworkExtractionProvider as ProviderName | null) ??
        "claude",
    );
  const [artistLookupProvider, setArtistLookupProvider] =
    useState<ProviderName>(
      (props.initial.artistLookupProvider as ProviderName | null) ?? "gemini",
    );
  const [artistBioProvider, setArtistBioProvider] = useState<ProviderName>(
    (props.initial.artistBioProvider as ProviderName | null) ?? "claude",
  );
  const [ingestEnabled, setIngestEnabled] = useState(
    props.initial.ingestEnabled,
  );
  const [ingestImageEnabled, setIngestImageEnabled] = useState(
    props.initial.ingestImageEnabled,
  );
  const [venueAutoPublish, setVenueAutoPublish] = useState(
    props.initial.venueAutoPublish,
  );
  const [regionAutoPublishVenues, setRegionAutoPublishVenues] = useState(
    props.initial.regionAutoPublishVenues ?? false,
  );
  const [regionAutoPublishEvents, setRegionAutoPublishEvents] = useState(
    props.initial.regionAutoPublishEvents ?? false,
  );
  const [regionAutoPublishArtists, setRegionAutoPublishArtists] = useState(
    props.initial.regionAutoPublishArtists ?? false,
  );
  const [enrichMatchedArtists, setEnrichMatchedArtists] = useState(
    props.initial.enrichMatchedArtists ?? false,
  );
  const [regionAutoPublishArtworks, setRegionAutoPublishArtworks] = useState(
    props.initial.regionAutoPublishArtworks ?? false,
  );
  const [regionDiscoveryEnabled, setRegionDiscoveryEnabled] = useState(
    props.initial.regionDiscoveryEnabled ?? false,
  );
  const [regionMaxVenuesPerRun, setRegionMaxVenuesPerRun] = useState(
    props.initial.regionMaxVenuesPerRun != null
      ? String(props.initial.regionMaxVenuesPerRun)
      : "",
  );
  const [venueGenerationModel, setVenueGenerationModel] = useState(
    props.initial.venueGenerationModel ?? "",
  );
  const [maxCandidates, setMaxCandidates] = useState(
    props.initial.ingestMaxCandidatesPerVenueRun != null
      ? String(props.initial.ingestMaxCandidatesPerVenueRun)
      : "",
  );
  const [duplicateThreshold, setDuplicateThreshold] = useState(
    props.initial.ingestDuplicateSimilarityThreshold != null
      ? String(props.initial.ingestDuplicateSimilarityThreshold)
      : "",
  );
  const [lookbackDays, setLookbackDays] = useState(
    props.initial.ingestDuplicateLookbackDays != null
      ? String(props.initial.ingestDuplicateLookbackDays)
      : "",
  );
  const [confidenceHigh, setConfidenceHigh] = useState(
    props.initial.ingestConfidenceHighMin != null
      ? String(props.initial.ingestConfidenceHighMin)
      : "",
  );
  const [confidenceMedium, setConfidenceMedium] = useState(
    props.initial.ingestConfidenceMediumMin != null
      ? String(props.initial.ingestConfidenceMediumMin)
      : "",
  );
  const [autoTagEnabled, setAutoTagEnabled] = useState(
    props.initial.autoTagEnabled,
  );
  const [autoTagProvider, setAutoTagProvider] = useState<ProviderName>(
    (props.initial.autoTagProvider as ProviderName | null) ?? "openai",
  );
  const [autoTagModel, setAutoTagModel] = useState(
    props.initial.autoTagModel ?? "",
  );
  const [eventPrompt, setEventPrompt] = useState(props.initial.ingestSystemPrompt ?? "");
  const [artworkPrompt, setArtworkPrompt] = useState(props.initial.artworkExtractionSystemPrompt ?? "");
  const [artistPrompt, setArtistPrompt] = useState(props.initial.artistBioSystemPrompt ?? "");
  const [model, setModel] = useState(props.initial.ingestModel ?? "");
  const [maxTokens, setMaxTokens] = useState(
    props.initial.ingestMaxOutputTokens != null
      ? String(props.initial.ingestMaxOutputTokens)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiTestResults, setAiTestResults] =
    useState<Record<string, AiTestResult | null>>({});
  const [aiTesting, setAiTesting] =
    useState<Record<string, boolean>>({});
  type SearchTestResult = {
    ok: boolean;
    durationMs: number;
    resultsCount?: number;
    errorMessage?: string;
    suggestion?: string;
    keysConfigured?: {
      googlePseApiKey: boolean;
      googlePseCx: boolean;
      braveSearchApiKey: boolean;
    };
  };

  const [pseTestResult, setPseTestResult] = useState<SearchTestResult | null>(null);
  const [pseTestingStatus, setPseTestingStatus] = useState<"idle" | "loading">("idle");

  const [braveTestResult, setBraveTestResult] = useState<SearchTestResult | null>(null);
  const [braveTestingStatus, setBraveTestingStatus] = useState<"idle" | "loading">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const body = {
        openAiApiKey: showOpenAiApiKey
          ? openAiApiKey.trim() || null
          : undefined,
        geminiApiKey: showGeminiApiKey
          ? geminiApiKey.trim() || null
          : undefined,
        anthropicApiKey: showAnthropicApiKey
          ? anthropicApiKey.trim() || null
          : undefined,
        googlePseApiKey: showGooglePseApiKey
          ? googlePseApiKey.trim() || null
          : undefined,
        braveSearchApiKey: showBraveSearchApiKey
          ? braveSearchApiKey.trim() || null
          : undefined,
        googlePseCx: googlePseCx.trim() || null,
        eventExtractionProvider,
        artworkExtractionProvider,
        artistLookupProvider,
        artistBioProvider,
        ingestEnabled,
        ingestImageEnabled,
        venueAutoPublish,
        regionAutoPublishVenues,
        regionAutoPublishEvents,
        regionAutoPublishArtists,
        enrichMatchedArtists,
        regionAutoPublishArtworks,
        regionDiscoveryEnabled,
        regionMaxVenuesPerRun: regionMaxVenuesPerRun.trim()
          ? Number.parseInt(regionMaxVenuesPerRun.trim(), 10)
          : null,
        venueGenerationModel: venueGenerationModel.trim() || null,
        ingestMaxCandidatesPerVenueRun: maxCandidates.trim()
          ? Number.parseInt(maxCandidates.trim(), 10)
          : null,
        ingestDuplicateSimilarityThreshold: duplicateThreshold.trim()
          ? Number.parseInt(duplicateThreshold.trim(), 10)
          : null,
        ingestDuplicateLookbackDays: lookbackDays.trim()
          ? Number.parseInt(lookbackDays.trim(), 10)
          : null,
        ingestConfidenceHighMin: confidenceHigh.trim()
          ? Number.parseInt(confidenceHigh.trim(), 10)
          : null,
        ingestConfidenceMediumMin: confidenceMedium.trim()
          ? Number.parseInt(confidenceMedium.trim(), 10)
          : null,
        autoTagEnabled,
        autoTagProvider: autoTagEnabled ? autoTagProvider : null,
        autoTagModel: autoTagEnabled ? autoTagModel.trim() || null : null,
        ingestSystemPrompt: eventPrompt.trim() || null,
        artworkExtractionSystemPrompt: artworkPrompt.trim() || null,
        artistBioSystemPrompt: artistPrompt.trim() || null,
        ingestModel: model.trim() || null,
        ingestMaxOutputTokens: maxTokens.trim()
          ? Number.parseInt(maxTokens.trim(), 10)
          : null,
      };

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setErrorMessage(data.error?.message ?? "Save failed.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setOpenAiApiKey("");
      setShowOpenAiApiKey(false);
      setGeminiApiKey("");
      setShowGeminiApiKey(false);
      setAnthropicApiKey("");
      setShowAnthropicApiKey(false);
      setGooglePseApiKey("");
      setShowGooglePseApiKey(false);
    } finally {
      setSaving(false);
    }
  }

  async function testAiProvider(
    provider: "openai" | "gemini" | "claude",
  ) {
    setAiTesting((prev) =>
      ({ ...prev, [provider]: true }));
    setAiTestResults((prev) =>
      ({ ...prev, [provider]: null }));
    try {
      const res = await fetch(
        `/api/admin/ai-test?provider=${provider}`,
      );
      const data =
        await res.json() as AiTestResult;
      setAiTestResults((prev) =>
        ({ ...prev, [provider]: data }));
    } catch {
      setAiTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          durationMs: 0,
          errorMessage: "Network error",
        },
      }));
    } finally {
      setAiTesting((prev) =>
        ({ ...prev, [provider]: false }));
    }
  }

  async function testPse() {
    setPseTestingStatus("loading");
    setPseTestResult(null);
    try {
      const res = await fetch(
        "/api/admin/ingest/search-test" +
          "?provider=google_pse" +
          "&query=contemporary+art+gallery&maxResults=3",
      );
      const data = (await res.json()) as SearchTestResult;
      setPseTestResult(data);
    } catch {
      setPseTestResult({
        ok: false,
        durationMs: 0,
        errorMessage: "Network error",
      });
    } finally {
      setPseTestingStatus("idle");
    }
  }

  async function testBrave() {
    setBraveTestingStatus("loading");
    setBraveTestResult(null);
    try {
      const res = await fetch(
        "/api/admin/ingest/search-test" +
          "?provider=brave" +
          "&query=contemporary+art+gallery&maxResults=3",
      );
      const data = (await res.json()) as SearchTestResult;
      setBraveTestResult(data);
    } catch {
      setBraveTestResult({
        ok: false,
        durationMs: 0,
        errorMessage: "Network error",
      });
    } finally {
      setBraveTestingStatus("idle");
    }
  }

  function AiTestResultBadge({
    provider,
    keySet,
  }: {
    provider: "openai" | "gemini" | "claude";
    keySet: boolean;
  }) {
    const result = aiTestResults[provider] ?? null;
    const testing = aiTesting[provider] ?? false;
    const label =
      provider === "openai" ? "OpenAI"
      : provider === "gemini" ? "Gemini"
      : "Anthropic";

    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={testing || !keySet}
          onClick={() => void testAiProvider(provider)}
          className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-muted"
        >
          {testing
            ? "Testing…"
            : `Test ${label}`}
        </button>
        {!keySet && (
          <span className="text-xs text-muted-foreground">
            Save key first
          </span>
        )}
        {result !== null ? (
          <span
            className={`text-xs font-medium ${
              result.ok
                ? "text-emerald-700"
                : "text-rose-700"
            }`}
          >
            {result.ok
              ? `✓ Connected · ${result.durationMs}ms` +
                (result.model
                  ? ` · ${result.model}`
                  : "")
              : `✗ ${result.errorMessage
                  ?? "Failed"} · ${result.durationMs}ms`}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-6">
      <h2 className="text-base font-semibold">Ingest &amp; AI</h2>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ingestEnabled}
          onChange={(e) => {
            setIngestEnabled(e.target.checked);
            setStatus("idle");
          }}
        />
        Enable ingest runs
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ingestImageEnabled}
          onChange={(e) => {
            setIngestImageEnabled(e.target.checked);
            setStatus("idle");
          }}
        />
        Enable ingest image prefetch
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={venueAutoPublish}
          onChange={(e) => {
            setVenueAutoPublish(e.target.checked);
            setStatus("idle");
          }}
        />
        Auto publish generated venues
      </label>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Region ingestion</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regionAutoPublishVenues}
            onChange={(e) => {
              setRegionAutoPublishVenues(e.target.checked);
              setStatus("idle");
            }}
          />
          Auto-publish venues from region runs
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regionAutoPublishEvents}
            onChange={(e) => {
              setRegionAutoPublishEvents(e.target.checked);
              setStatus("idle");
            }}
          />
          Auto-publish events from region runs (HIGH confidence only)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regionAutoPublishArtists}
            onChange={(e) => {
              setRegionAutoPublishArtists(e.target.checked);
              setStatus("idle");
            }}
          />
          Auto-publish artists from region runs
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enrichMatchedArtists}
            onChange={(e) => setEnrichMatchedArtists(e.target.checked)}
          />
          <span>
            Enrich matched artists
            <span className="ml-1 text-xs text-muted-foreground">
              Re-run discovery on existing artists with sparse profiles (missing bio, mediums, or image) when they are matched during event approval. Requires <code>AI_ARTIST_ENRICH_ON_MATCH=1</code>.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regionAutoPublishArtworks}
            onChange={(e) => {
              setRegionAutoPublishArtworks(e.target.checked);
              setStatus("idle");
            }}
          />
          Auto-publish artworks from region runs
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regionDiscoveryEnabled}
            onChange={(e) => {
              setRegionDiscoveryEnabled(e.target.checked);
              setStatus("idle");
            }}
          />
          Enable web discovery per region
        </label>
        <label className="space-y-1 text-sm">
          <span>Max venues per region run</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={regionMaxVenuesPerRun}
            onChange={(e) => {
              setRegionMaxVenuesPerRun(e.target.value);
              setStatus("idle");
            }}
            type="number"
            placeholder="default 10"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="openai-key">
          OpenAI API key
        </label>
        {showOpenAiApiKey ? (
          <input
            id="openai-key"
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={openAiApiKey}
            onChange={(e) => {
              setOpenAiApiKey(e.target.value);
              setAiTestResults((prev) =>
                ({ ...prev, openai: null }));
              setStatus("idle");
            }}
            placeholder={
              props.initial.openAiApiKeySet ? "•••••••• (stored)" : "sk-..."
            }
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {props.initial.openAiApiKeySet
              ? "API key is currently set."
              : "No API key set."}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowOpenAiApiKey(true)}
            >
              Change
            </button>
          </div>
        )}
        <AiTestResultBadge
          provider="openai"
          keySet={props.initial.openAiApiKeySet}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="gemini-key">
          Gemini API key
        </label>
        {showGeminiApiKey ? (
          <input
            id="gemini-key"
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={geminiApiKey}
            onChange={(e) => {
              setGeminiApiKey(e.target.value);
              setAiTestResults((prev) =>
                ({ ...prev, gemini: null }));
              setStatus("idle");
            }}
            placeholder={
              props.initial.geminiApiKeySet ? "•••••••• (stored)" : "AIza..."
            }
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {props.initial.geminiApiKeySet
              ? "API key is currently set."
              : "No API key set."}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowGeminiApiKey(true)}
            >
              Change
            </button>
          </div>
        )}
        <AiTestResultBadge
          provider="gemini"
          keySet={props.initial.geminiApiKeySet}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="anthropic-key">
          Anthropic API key
        </label>
        {showAnthropicApiKey ? (
          <input
            id="anthropic-key"
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={anthropicApiKey}
            onChange={(e) => {
              setAnthropicApiKey(e.target.value);
              setAiTestResults((prev) =>
                ({ ...prev, claude: null }));
              setStatus("idle");
            }}
            placeholder={
              props.initial.anthropicApiKeySet
                ? "•••••••• (stored)"
                : "sk-ant-..."
            }
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {props.initial.anthropicApiKeySet
              ? "API key is currently set."
              : "No API key set."}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowAnthropicApiKey(true)}
            >
              Change
            </button>
          </div>
        )}
        <AiTestResultBadge
          provider="claude"
          keySet={props.initial.anthropicApiKeySet}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="google-pse-key">
          Google PSE API Key
        </label>
        {showGooglePseApiKey ? (
          <input
            id="google-pse-key"
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={googlePseApiKey}
            onChange={(e) => {
              setGooglePseApiKey(e.target.value);
              setPseTestResult(null);
              setStatus("idle");
            }}
            placeholder={
              props.initial.googlePseApiKeySet ? "•••••••• (stored)" : "AIza..."
            }
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {props.initial.googlePseApiKeySet
              ? "API key is currently set."
              : "No API key set."}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowGooglePseApiKey(true)}
            >
              Change
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="brave-search-key">
          Brave Search API Key
        </label>
        {showBraveSearchApiKey ? (
          <input
            id="brave-search-key"
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={braveSearchApiKey}
            onChange={(e) => {
              setBraveSearchApiKey(e.target.value);
              setBraveTestResult(null);
              setStatus("idle");
            }}
            placeholder={
              props.initial.braveSearchApiKeySet
                ? "•••••••• (stored)"
                : "BSA..."
            }
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {props.initial.braveSearchApiKeySet
              ? "API key is currently set."
              : "No API key set."}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowBraveSearchApiKey(true)}
            >
              Change
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={
              braveTestingStatus === "loading" ||
              !props.initial.braveSearchApiKeySet
            }
            onClick={() => void testBrave()}
            className="rounded border px-3 py-1.5 text-xs
              disabled:opacity-50 hover:bg-muted"
          >
            {braveTestingStatus === "loading" ? "Testing…" : "Test connection"}
          </button>
          {!props.initial.braveSearchApiKeySet && (
            <span className="text-xs text-muted-foreground">
              Save API key first
            </span>
          )}
        </div>

        {braveTestResult !== null ? (
          <div
            className={`mt-2 rounded border p-2 text-xs
              ${
                braveTestResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
          >
            <span className="font-medium">
              {braveTestResult.ok ? "✓ Connected" : "✗ Failed"}
            </span>
            {" · "}
            {braveTestResult.durationMs}ms
            {braveTestResult.ok && braveTestResult.resultsCount !== undefined ? (
              <span className="ml-1 text-emerald-700">
                · {braveTestResult.resultsCount} result(s)
              </span>
            ) : null}
            {!braveTestResult.ok && braveTestResult.errorMessage ? (
              <div className="mt-1 font-mono text-rose-700">
                {braveTestResult.errorMessage}
              </div>
            ) : null}
            {!braveTestResult.ok && braveTestResult.suggestion ? (
              <div className="mt-1 text-rose-600">
                → {braveTestResult.suggestion}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="google-pse-cx">
          Google PSE Context ID (cx)
        </label>
        <input
          id="google-pse-cx"
          type="text"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={googlePseCx}
          onChange={(e) => {
            setGooglePseCx(e.target.value);
            setPseTestResult(null);
            setStatus("idle");
          }}
          placeholder="Search engine cx"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={
              pseTestingStatus === "loading" ||
              !props.initial.googlePseApiKeySet
            }
            onClick={() => void testPse()}
            className="rounded border px-3 py-1.5 text-xs
              disabled:opacity-50 hover:bg-muted"
          >
            {pseTestingStatus === "loading" ? "Testing…" : "Test connection"}
          </button>
          {!props.initial.googlePseApiKeySet && (
            <span className="text-xs text-muted-foreground">
              Save API key first
            </span>
          )}
        </div>

        {pseTestResult !== null ? (
          <div
            className={`mt-2 rounded border p-2 text-xs
              ${
                pseTestResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
          >
            <span className="font-medium">
              {pseTestResult.ok ? "✓ Connected" : "✗ Failed"}
            </span>
            {" · "}
            {pseTestResult.durationMs}ms
            {pseTestResult.ok && pseTestResult.resultsCount !== undefined ? (
              <span className="ml-1 text-emerald-700">
                · {pseTestResult.resultsCount} result(s)
              </span>
            ) : null}
            {!pseTestResult.ok && pseTestResult.errorMessage ? (
              <div className="mt-1 font-mono text-rose-700">
                {pseTestResult.errorMessage}
              </div>
            ) : null}
            {!pseTestResult.ok && pseTestResult.suggestion ? (
              <div className="mt-1 text-rose-600">
                → {pseTestResult.suggestion}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Extraction providers</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Event extraction provider</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={eventExtractionProvider}
              onChange={(e) => {
                setEventExtractionProvider(e.target.value as ProviderName);
                setStatus("idle");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artwork extraction provider</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={artworkExtractionProvider}
              onChange={(e) => {
                setArtworkExtractionProvider(e.target.value as ProviderName);
                setStatus("idle");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artist lookup provider</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={artistLookupProvider}
              onChange={(e) => {
                setArtistLookupProvider(e.target.value as ProviderName);
                setStatus("idle");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artist bio provider</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={artistBioProvider}
              onChange={(e) => {
                setArtistBioProvider(e.target.value as ProviderName);
                setStatus("idle");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Auto-tagging</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoTagEnabled}
            onChange={(e) => {
              setAutoTagEnabled(e.target.checked);
              setStatus("idle");
            }}
          />
          Enable AI auto-tagging on event approval
        </label>
        {autoTagEnabled ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Auto-tag provider</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={autoTagProvider}
                onChange={(e) => {
                  setAutoTagProvider(e.target.value as ProviderName);
                  setStatus("idle");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Auto-tag model (leave blank for default)</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={autoTagModel}
                onChange={(e) => {
                  setAutoTagModel(e.target.value);
                  setStatus("idle");
                }}
                type="text"
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={venueGenerationModel}
          onChange={(e) => setVenueGenerationModel(e.target.value)}
          placeholder="Venue generation model (VENUE_GENERATION_MODEL)"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={maxCandidates}
          onChange={(e) => setMaxCandidates(e.target.value)}
          type="number"
          placeholder="25"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={duplicateThreshold}
          onChange={(e) => setDuplicateThreshold(e.target.value)}
          type="number"
          placeholder="85"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={lookbackDays}
          onChange={(e) => setLookbackDays(e.target.value)}
          type="number"
          placeholder="30"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={confidenceHigh}
          onChange={(e) => setConfidenceHigh(e.target.value)}
          type="number"
          placeholder="75"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={confidenceMedium}
          onChange={(e) => setConfidenceMedium(e.target.value)}
          type="number"
          placeholder="45"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Extraction system prompts</h3>
        <p className="text-xs text-muted-foreground">
          Leave blank to use the built-in default prompt for each type.
        </p>

        <label className="space-y-1 text-sm block">
          <span>Event extraction prompt</span>
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={eventPrompt}
            onChange={(e) => { setEventPrompt(e.target.value); setStatus("idle"); }}
            placeholder="Leave blank to use the built-in event extraction prompt"
          />
        </label>

        <label className="space-y-1 text-sm block">
          <span>Artwork extraction prompt</span>
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={artworkPrompt}
            onChange={(e) => { setArtworkPrompt(e.target.value); setStatus("idle"); }}
            placeholder="Leave blank to use the built-in artwork extraction prompt"
          />
        </label>

        <label className="space-y-1 text-sm block">
          <span>Artist bio extraction prompt</span>
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={artistPrompt}
            onChange={(e) => { setArtistPrompt(e.target.value); setStatus("idle"); }}
            placeholder="Leave blank to use the built-in artist bio extraction prompt"
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Ingest model (OPENAI_MODEL)"
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={maxTokens}
          onChange={(e) => setMaxTokens(e.target.value)}
          type="number"
          placeholder="4000"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
      {status === "saved" ? (
        <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Settings saved.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {errorMessage ?? "An error occurred."}
        </div>
      ) : null}
    </section>
  );
}
