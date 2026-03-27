import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, shouldApply, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";
import { scoreArtistCandidate } from "@/lib/ingest/artist-confidence";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { getSearchProvider } from "@/lib/ingest/search";

const KNOWN_ART_DOMAINS = [
  "artsy.net",
  "tate.org.uk",
  "moma.org",
  "royalacademy.org.uk",
  "saatchigallery.com",
  "theguardian.com",
  "frieze.com",
  "artforum.com",
] as const;

const DEFAULT_ARTIST_BIO_PROMPT = `You are an art researcher. Given a webpage about an artist,
extract: a concise professional bio (2-4 sentences), their
primary mediums as an array of short strings, their website
URL, Instagram URL, Twitter/X URL, and nationality.
Return null for any field not found. Do not invent facts.`;

function slugifyName(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function scoreSearchResult(result: { url: string; snippet?: string | null }, artistName: string, artistSlug: string): number {
  let score = 0;
  const snippet = (result.snippet ?? "").toLowerCase();
  const artistLower = artistName.toLowerCase();
  const urlLower = result.url.toLowerCase();

  if (snippet.includes(artistLower)) score += 2;
  if (artistSlug && urlLower.includes(artistSlug)) score += 1;
  if (KNOWN_ART_DOMAINS.some((domain) => urlLower.includes(domain))) score += 1;

  return score;
}

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

export async function enrichArtistBio(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const artist = await args.db.artist.findUnique({
    where: { id: args.entityId },
    select: {
      id: true,
      name: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      mediums: true,
    },
  });

  if (!artist) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "artist_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.ARTIST_BIO.queryTemplate, { name: artist.name });
  let searchUrl: string | null = null;

  if (args.settings.searchEnabled !== false && query) {
    const provider = getSearchProvider(args.searchProvider, args.settings);
    const results = await provider.search(query, 5);
    if (results.length > 0) {
      const artistSlug = slugifyName(artist.name);
      const scored = results.map((result) => ({ result, score: scoreSearchResult(result, artist.name, artistSlug) }));
      const best = scored.reduce((max, current) => (current.score > max.score ? current : max), scored[0]);
      searchUrl = best.score > 0 ? best.result.url : results[0]?.url ?? null;
    }
  }

  const confidenceBefore = scoreArtistCandidate({
    name: artist.name,
    bio: artist.bio,
    websiteUrl: artist.websiteUrl,
    instagramUrl: artist.instagramUrl,
    twitterUrl: artist.twitterUrl,
    mediums: artist.mediums,
    birthYear: null,
    searchQuery: query,
    wikipediaMatch: !!searchUrl?.includes("wikipedia.org"),
  }).score;

  const extractionProvider = getProvider((args.settings.artistBioProvider as ProviderName | null) ?? "claude");
  const apiKey = resolveProviderApiKey(extractionProvider.name, args.settings);

  if (!apiKey || !searchUrl) {
    return {
      status: "skipped",
      fieldsChanged: [],
      fieldsBefore: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      fieldsAfter: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      confidenceBefore,
      confidenceAfter: confidenceBefore,
      searchUrl,
      reason: !apiKey ? "missing_api_key" : "missing_source_url",
    };
  }

  let html: string;
  try {
    const fetched = await fetchHtmlWithGuards(searchUrl);
    html = fetched.html;
  } catch {
    return {
      status: "skipped",
      fieldsChanged: [],
      fieldsBefore: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      fieldsAfter: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      confidenceBefore,
      confidenceAfter: confidenceBefore,
      searchUrl,
      reason: "failed_to_fetch_source",
    };
  }

  const extracted = await extractionProvider.extract({
    html,
    sourceUrl: searchUrl,
    systemPrompt: args.settings.artistBioSystemPrompt?.trim() || DEFAULT_ARTIST_BIO_PROMPT,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        bio: { type: ["string", "null"] },
        mediums: { type: "array", items: { type: "string" } },
        websiteUrl: { type: ["string", "null"] },
        instagramUrl: { type: ["string", "null"] },
        twitterUrl: { type: ["string", "null"] },
        nationality: { type: ["string", "null"] },
      },
      required: ["bio", "mediums", "websiteUrl", "instagramUrl", "twitterUrl", "nationality"],
    },
    model: "",
    apiKey,
  });

  const raw = extracted.raw && typeof extracted.raw === "object" ? extracted.raw as Record<string, unknown> : null;
  const candidateBio = typeof raw?.bio === "string" ? raw.bio.trim() : null;
  const candidateWebsiteUrl = typeof raw?.websiteUrl === "string" ? raw.websiteUrl.trim() : null;
  const candidateInstagramUrl = typeof raw?.instagramUrl === "string" ? raw.instagramUrl.trim() : null;
  const candidateTwitterUrl = typeof raw?.twitterUrl === "string" ? raw.twitterUrl.trim() : null;
  const candidateMediums = Array.isArray(raw?.mediums)
    ? raw.mediums.filter((medium): medium is string => typeof medium === "string").map((medium) => medium.trim()).filter(Boolean)
    : [];

  const patch: {
    bio?: string;
    websiteUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    mediums?: string[];
  } = {};

  if (shouldApply(artist.bio, candidateBio, args.settings.gapFilter)) patch.bio = candidateBio;
  if (shouldApply(artist.websiteUrl, candidateWebsiteUrl, args.settings.gapFilter)) patch.websiteUrl = candidateWebsiteUrl;
  if (shouldApply(artist.instagramUrl, candidateInstagramUrl, args.settings.gapFilter)) patch.instagramUrl = candidateInstagramUrl;
  if (shouldApply(artist.twitterUrl, candidateTwitterUrl, args.settings.gapFilter)) patch.twitterUrl = candidateTwitterUrl;
  if (candidateMediums.length > 0 && (artist.mediums.length === 0 || args.settings.gapFilter === "ALL")) patch.mediums = candidateMediums;

  if (Object.keys(patch).length === 0) {
    return {
      status: "skipped",
      fieldsChanged: [],
      fieldsBefore: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      fieldsAfter: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      confidenceBefore,
      confidenceAfter: confidenceBefore,
      searchUrl,
      reason: "no_improvement_found",
    };
  }

  const projectedAfter = {
    name: artist.name,
    bio: patch.bio ?? artist.bio,
    websiteUrl: patch.websiteUrl ?? artist.websiteUrl,
    instagramUrl: patch.instagramUrl ?? artist.instagramUrl,
    twitterUrl: patch.twitterUrl ?? artist.twitterUrl,
    mediums: patch.mediums ?? artist.mediums,
  };

  const confidenceAfter = scoreArtistCandidate({
    name: projectedAfter.name,
    bio: projectedAfter.bio,
    websiteUrl: projectedAfter.websiteUrl,
    instagramUrl: projectedAfter.instagramUrl,
    twitterUrl: projectedAfter.twitterUrl,
    mediums: projectedAfter.mediums,
    birthYear: null,
    searchQuery: query,
    wikipediaMatch: !!searchUrl?.includes("wikipedia.org"),
  }).score;

  if (args.dryRun) {
    return {
      status: "success",
      fieldsChanged: Object.keys(patch),
      fieldsBefore: {
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        instagramUrl: artist.instagramUrl,
        twitterUrl: artist.twitterUrl,
        mediums: artist.mediums,
      },
      fieldsAfter: patch,
      confidenceBefore,
      confidenceAfter,
      searchUrl,
    };
  }

  const updated = await args.db.artist.update({
    where: { id: artist.id },
    data: patch,
    select: {
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      mediums: true,
    },
  });

  return {
    status: "success",
    fieldsChanged: Object.keys(patch),
    fieldsBefore: {
      bio: artist.bio,
      websiteUrl: artist.websiteUrl,
      instagramUrl: artist.instagramUrl,
      twitterUrl: artist.twitterUrl,
      mediums: artist.mediums,
    },
    fieldsAfter: {
      bio: updated.bio,
      websiteUrl: updated.websiteUrl,
      instagramUrl: updated.instagramUrl,
      twitterUrl: updated.twitterUrl,
      mediums: updated.mediums,
    },
    confidenceBefore,
    confidenceAfter,
    searchUrl,
  };
}
