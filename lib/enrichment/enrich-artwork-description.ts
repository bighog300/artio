import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, shouldApply, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { getSearchProvider } from "@/lib/ingest/search";

const DEFAULT_DESCRIPTION_PROMPT = `You are an art writer. Given
artwork metadata, write a concise, professional description
(2–3 sentences, 40–80 words). Focus on the work's visual
character, materials, and mood. Do not invent facts not in
the metadata. Return only the description text with no
preamble or quotes.`;

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

export async function enrichArtworkDescription(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const artwork = await args.db.artwork.findUnique({
    where: { id: args.entityId },
    select: {
      id: true,
      title: true,
      description: true,
      medium: true,
      year: true,
      dimensions: true,
      featuredAssetId: true,
      provenance: true,
      _count: { select: { images: true } },
      artist: { select: { name: true } },
    },
  });

  if (!artwork) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "artwork_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.ARTWORK_DESCRIPTION.queryTemplate, { title: artwork.title });
  let searchUrl: string | null = null;
  if (args.settings.searchEnabled !== false && query) {
    const provider = getSearchProvider(args.searchProvider, args.settings);
    const results = await provider.search(query, 5);
    searchUrl = results[0]?.url ?? null;
  }

  const confidenceBefore = computeArtworkCompleteness({
    title: artwork.title,
    description: artwork.description,
    medium: artwork.medium,
    year: artwork.year,
    featuredAssetId: artwork.featuredAssetId,
    dimensions: artwork.dimensions,
    provenance: artwork.provenance,
  }, artwork._count.images).scorePct;

  const extractionProvider = getProvider((args.settings.artworkExtractionProvider as ProviderName | null) ?? "claude");
  const apiKey = resolveProviderApiKey(extractionProvider.name, args.settings);
  if (!apiKey) {
    return { status: "skipped", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore, confidenceAfter: confidenceBefore, searchUrl, reason: "missing_api_key" };
  }

  const userPrompt = [
    `Title: ${artwork.title}`,
    artwork.artist?.name ? `Artist: ${artwork.artist.name}` : null,
    artwork.medium ? `Medium: ${artwork.medium}` : null,
    artwork.year ? `Year: ${artwork.year}` : null,
    artwork.dimensions ? `Dimensions: ${artwork.dimensions}` : null,
  ].filter(Boolean).join("\n");

  const extracted = await extractionProvider.extract({
    html: userPrompt,
    sourceUrl: searchUrl ?? "",
    systemPrompt: args.settings.artworkExtractionSystemPrompt?.trim() || DEFAULT_DESCRIPTION_PROMPT,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { description: { type: "string" } },
      required: ["description"],
    },
    model: "",
    apiKey,
  });

  const rawDescription =
    extracted.raw && typeof extracted.raw === "object"
      ? (extracted.raw as Record<string, unknown>).description
      : null;
  const description = typeof rawDescription === "string" ? rawDescription.trim() : null;

  if (!shouldApply(artwork.description, description, args.settings.gapFilter)) {
    return { status: "skipped", fieldsChanged: [], fieldsBefore: { description: artwork.description }, fieldsAfter: { description: artwork.description }, confidenceBefore, confidenceAfter: confidenceBefore, searchUrl, reason: "no_missing_fields" };
  }

  const updated = await args.db.artwork.update({
    where: { id: artwork.id },
    data: { description, completenessUpdatedAt: null },
    select: { description: true, title: true, medium: true, year: true, featuredAssetId: true, dimensions: true, provenance: true, _count: { select: { images: true } } },
  });

  const confidenceAfter = computeArtworkCompleteness({
    title: updated.title,
    description: updated.description,
    medium: updated.medium,
    year: updated.year,
    featuredAssetId: updated.featuredAssetId,
    dimensions: updated.dimensions,
    provenance: updated.provenance,
  }, updated._count.images).scorePct;

  return {
    status: "success",
    fieldsChanged: ["description"],
    fieldsBefore: { description: artwork.description },
    fieldsAfter: { description: updated.description },
    confidenceBefore,
    confidenceAfter,
    searchUrl,
  };
}
