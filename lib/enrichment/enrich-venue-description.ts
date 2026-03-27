import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, shouldApply, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";
import { enrichVenueFromSnapshot } from "@/lib/ingest/enrich-venue-from-snapshot";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { getSearchProvider } from "@/lib/ingest/search";

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: { openAiApiKey?: string | null; anthropicApiKey?: string | null; geminiApiKey?: string | null },
): string {
  switch (provider) {
    case "claude":
      return settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    case "gemini":
      return settings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";
    default:
      return settings.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  }
}

function descriptionConfidence(value: string | null): number {
  if (!value) return 0;
  if (value.length > 100) return 90;
  if (value.length > 30) return 70;
  return 50;
}

export async function enrichVenueDescription(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const venue = await args.db.venue.findUnique({
    where: { id: args.entityId },
    select: { id: true, name: true, description: true },
  });

  if (!venue) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "venue_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.VENUE_DESCRIPTION.queryTemplate, { name: venue.name });
  let searchUrl: string | null = null;
  if (args.settings.searchEnabled !== false && query) {
    const search = getSearchProvider(args.searchProvider, args.settings);
    const results = await search.search(query, 5);
    searchUrl = results[0]?.url ?? null;
  }

  const provider = getProvider((args.settings.venueEnrichmentProvider as ProviderName | null) ?? "claude");
  const apiKey = resolveProviderApiKey(provider.name, args.settings);
  if (!apiKey || !searchUrl) {
    const score = descriptionConfidence(venue.description);
    return { status: "skipped", fieldsChanged: [], fieldsBefore: { description: venue.description }, fieldsAfter: { description: venue.description }, confidenceBefore: score, confidenceAfter: score, searchUrl, reason: !apiKey ? "missing_api_key" : "missing_source_url" };
  }

  const extracted = await provider.extract({
    html: `Venue: ${venue.name}`,
    sourceUrl: searchUrl,
    systemPrompt: "Extract venue description only. Return a concise factual paragraph.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        venueDescription: { type: ["string", "null"] },
      },
      required: ["venueDescription"],
    },
    model: "",
    apiKey,
  });

  const raw = extracted.raw && typeof extracted.raw === "object"
    ? (extracted.raw as Record<string, unknown>).venueDescription
    : null;
  const nextDescription = typeof raw === "string" ? raw.trim() : null;
  const confidenceBefore = descriptionConfidence(venue.description);

  if (!shouldApply(venue.description, nextDescription, args.settings.gapFilter)) {
    return { status: "skipped", fieldsChanged: [], fieldsBefore: { description: venue.description }, fieldsAfter: { description: venue.description }, confidenceBefore, confidenceAfter: confidenceBefore, searchUrl, reason: "no_missing_fields" };
  }

  const enriched = await enrichVenueFromSnapshot({
    db: args.db,
    venueId: venue.id,
    runId: `manual-${venue.id}`,
    sourceDomain: searchUrl,
    snapshot: { venueDescription: nextDescription },
  });

  const updated = await args.db.venue.findUnique({ where: { id: venue.id }, select: { description: true } });
  const confidenceAfter = descriptionConfidence(updated?.description ?? null);

  return {
    status: enriched.enriched ? "success" : "skipped",
    fieldsChanged: enriched.changedFields,
    fieldsBefore: { description: venue.description },
    fieldsAfter: { description: updated?.description ?? null },
    confidenceBefore,
    confidenceAfter,
    searchUrl,
  };
}
