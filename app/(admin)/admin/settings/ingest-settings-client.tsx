"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ProviderName = "openai" | "gemini" | "claude";

type IngestSettingsProps = {
  initial: {
    ingestSystemPrompt: string | null;
    ingestModel: string | null;
    ingestMaxOutputTokens: number | null;
    openAiApiKeySet: boolean;
    geminiApiKeySet: boolean;
    anthropicApiKeySet: boolean;
    eventExtractionProvider: string | null;
    artworkExtractionProvider: string | null;
    artistLookupProvider: string | null;
    artistBioProvider: string | null;
    ingestEnabled: boolean;
    ingestImageEnabled: boolean;
    venueAutoPublish: boolean;
    venueGenerationModel: string | null;
    ingestMaxCandidatesPerVenueRun: number | null;
    ingestDuplicateSimilarityThreshold: number | null;
    ingestDuplicateLookbackDays: number | null;
    ingestConfidenceHighMin: number | null;
    ingestConfidenceMediumMin: number | null;
  };
};

export default function IngestSettingsClient(props: IngestSettingsProps) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [showAnthropicApiKey, setShowAnthropicApiKey] = useState(false);
  const [eventExtractionProvider, setEventExtractionProvider] = useState<ProviderName>((props.initial.eventExtractionProvider as ProviderName | null) ?? "openai");
  const [artworkExtractionProvider, setArtworkExtractionProvider] = useState<ProviderName>((props.initial.artworkExtractionProvider as ProviderName | null) ?? "claude");
  const [artistLookupProvider, setArtistLookupProvider] = useState<ProviderName>((props.initial.artistLookupProvider as ProviderName | null) ?? "gemini");
  const [artistBioProvider, setArtistBioProvider] = useState<ProviderName>((props.initial.artistBioProvider as ProviderName | null) ?? "claude");
  const [ingestEnabled, setIngestEnabled] = useState(props.initial.ingestEnabled);
  const [ingestImageEnabled, setIngestImageEnabled] = useState(props.initial.ingestImageEnabled);
  const [venueAutoPublish, setVenueAutoPublish] = useState(props.initial.venueAutoPublish);
  const [venueGenerationModel, setVenueGenerationModel] = useState(props.initial.venueGenerationModel ?? "");
  const [maxCandidates, setMaxCandidates] = useState(props.initial.ingestMaxCandidatesPerVenueRun != null ? String(props.initial.ingestMaxCandidatesPerVenueRun) : "");
  const [duplicateThreshold, setDuplicateThreshold] = useState(props.initial.ingestDuplicateSimilarityThreshold != null ? String(props.initial.ingestDuplicateSimilarityThreshold) : "");
  const [lookbackDays, setLookbackDays] = useState(props.initial.ingestDuplicateLookbackDays != null ? String(props.initial.ingestDuplicateLookbackDays) : "");
  const [confidenceHigh, setConfidenceHigh] = useState(props.initial.ingestConfidenceHighMin != null ? String(props.initial.ingestConfidenceHighMin) : "");
  const [confidenceMedium, setConfidenceMedium] = useState(props.initial.ingestConfidenceMediumMin != null ? String(props.initial.ingestConfidenceMediumMin) : "");
  const [prompt, setPrompt] = useState(props.initial.ingestSystemPrompt ?? "");
  const [model, setModel] = useState(props.initial.ingestModel ?? "");
  const [maxTokens, setMaxTokens] = useState(props.initial.ingestMaxOutputTokens != null ? String(props.initial.ingestMaxOutputTokens) : "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const body = {
        openAiApiKey: showOpenAiApiKey ? (openAiApiKey.trim() || null) : undefined,
        geminiApiKey: showGeminiApiKey ? (geminiApiKey.trim() || null) : undefined,
        anthropicApiKey: showAnthropicApiKey ? (anthropicApiKey.trim() || null) : undefined,
        eventExtractionProvider,
        artworkExtractionProvider,
        artistLookupProvider,
        artistBioProvider,
        ingestEnabled,
        ingestImageEnabled,
        venueAutoPublish,
        venueGenerationModel: venueGenerationModel.trim() || null,
        ingestMaxCandidatesPerVenueRun: maxCandidates.trim() ? Number.parseInt(maxCandidates.trim(), 10) : null,
        ingestDuplicateSimilarityThreshold: duplicateThreshold.trim() ? Number.parseInt(duplicateThreshold.trim(), 10) : null,
        ingestDuplicateLookbackDays: lookbackDays.trim() ? Number.parseInt(lookbackDays.trim(), 10) : null,
        ingestConfidenceHighMin: confidenceHigh.trim() ? Number.parseInt(confidenceHigh.trim(), 10) : null,
        ingestConfidenceMediumMin: confidenceMedium.trim() ? Number.parseInt(confidenceMedium.trim(), 10) : null,
        ingestSystemPrompt: prompt.trim() || null,
        ingestModel: model.trim() || null,
        ingestMaxOutputTokens: maxTokens.trim() ? Number.parseInt(maxTokens.trim(), 10) : null,
      };

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-6">
      <h2 className="text-base font-semibold">Ingest &amp; AI</h2>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ingestEnabled} onChange={(e) => { setIngestEnabled(e.target.checked); setStatus("idle"); }} />Enable ingest runs</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ingestImageEnabled} onChange={(e) => { setIngestImageEnabled(e.target.checked); setStatus("idle"); }} />Enable ingest image prefetch</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={venueAutoPublish} onChange={(e) => { setVenueAutoPublish(e.target.checked); setStatus("idle"); }} />Auto publish generated venues</label>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="openai-key">OpenAI API key</label>
        {showOpenAiApiKey ? (
          <input id="openai-key" type="password" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={openAiApiKey} onChange={(e) => { setOpenAiApiKey(e.target.value); setStatus("idle"); }} placeholder={props.initial.openAiApiKeySet ? "•••••••• (stored)" : "sk-..."} />
        ) : (
          <div className="text-xs text-muted-foreground">{props.initial.openAiApiKeySet ? "API key is currently set." : "No API key set."} <button type="button" className="underline" onClick={() => setShowOpenAiApiKey(true)}>Change</button></div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="gemini-key">Gemini API key</label>
        {showGeminiApiKey ? (
          <input id="gemini-key" type="password" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={geminiApiKey} onChange={(e) => { setGeminiApiKey(e.target.value); setStatus("idle"); }} placeholder={props.initial.geminiApiKeySet ? "•••••••• (stored)" : "AIza..."} />
        ) : (
          <div className="text-xs text-muted-foreground">{props.initial.geminiApiKeySet ? "API key is currently set." : "No API key set."} <button type="button" className="underline" onClick={() => setShowGeminiApiKey(true)}>Change</button></div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="anthropic-key">Anthropic API key</label>
        {showAnthropicApiKey ? (
          <input id="anthropic-key" type="password" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={anthropicApiKey} onChange={(e) => { setAnthropicApiKey(e.target.value); setStatus("idle"); }} placeholder={props.initial.anthropicApiKeySet ? "•••••••• (stored)" : "sk-ant-..."} />
        ) : (
          <div className="text-xs text-muted-foreground">{props.initial.anthropicApiKeySet ? "API key is currently set." : "No API key set."} <button type="button" className="underline" onClick={() => setShowAnthropicApiKey(true)}>Change</button></div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Extraction providers</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Event extraction provider</span>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={eventExtractionProvider} onChange={(e) => { setEventExtractionProvider(e.target.value as ProviderName); setStatus("idle"); }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artwork extraction provider</span>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={artworkExtractionProvider} onChange={(e) => { setArtworkExtractionProvider(e.target.value as ProviderName); setStatus("idle"); }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artist lookup provider</span>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={artistLookupProvider} onChange={(e) => { setArtistLookupProvider(e.target.value as ProviderName); setStatus("idle"); }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Artist bio provider</span>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={artistBioProvider} onChange={(e) => { setArtistBioProvider(e.target.value as ProviderName); setStatus("idle"); }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input className="rounded-md border px-3 py-2 text-sm" value={venueGenerationModel} onChange={(e) => setVenueGenerationModel(e.target.value)} placeholder="Venue generation model (VENUE_GENERATION_MODEL)" />
        <input className="rounded-md border px-3 py-2 text-sm" value={maxCandidates} onChange={(e) => setMaxCandidates(e.target.value)} type="number" placeholder="25" />
        <input className="rounded-md border px-3 py-2 text-sm" value={duplicateThreshold} onChange={(e) => setDuplicateThreshold(e.target.value)} type="number" placeholder="85" />
        <input className="rounded-md border px-3 py-2 text-sm" value={lookbackDays} onChange={(e) => setLookbackDays(e.target.value)} type="number" placeholder="30" />
        <input className="rounded-md border px-3 py-2 text-sm" value={confidenceHigh} onChange={(e) => setConfidenceHigh(e.target.value)} type="number" placeholder="75" />
        <input className="rounded-md border px-3 py-2 text-sm" value={confidenceMedium} onChange={(e) => setConfidenceMedium(e.target.value)} type="number" placeholder="45" />
      </div>

      <textarea className="w-full min-h-[160px] rounded-md border px-3 py-2 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Extraction system prompt" />
      <div className="grid gap-4 md:grid-cols-2">
        <input className="rounded-md border px-3 py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ingest model (OPENAI_MODEL)" />
        <input className="rounded-md border px-3 py-2 text-sm" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} type="number" placeholder="4000" />
      </div>

      <div className="flex items-center gap-3 pt-2"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></div>
      {status === "saved" ? <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">Settings saved.</div> : null}
      {status === "error" ? <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{errorMessage ?? "An error occurred."}</div> : null}
    </section>
  );
}
