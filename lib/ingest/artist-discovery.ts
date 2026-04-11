import { createHash } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { IngestError } from "@/lib/ingest/errors";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { scoreArtistCandidate } from "@/lib/ingest/artist-confidence";
import { autoApproveArtistCandidate } from "@/lib/ingest/auto-approve-artist-candidate";
import { logWarn } from "@/lib/logging";

export const DEFAULT_ARTIST_BIO_SYSTEM_PROMPT = [
  "You are extracting an artist profile from a webpage.",
  "The page may cover a single artist or multiple — focus only on the primary artist named in the search query.",
  "Return only values clearly stated on the page. Do not invent, infer, or hallucinate.",
  "",
  "Fields:",
  "- name: Full name as it appears on the page. Return null if the page covers multiple artists or the name is ambiguous.",
  "- bio: 2-4 sentence factual biography. Focus on medium, career, and notable exhibitions or collections. Return null if there is insufficient content to write a meaningful bio.",
  "- mediums: Array of artistic mediums exactly as stated (e.g. ['oil painting', 'bronze sculpture', 'archival pigment print']). Return empty array if not stated.",
  "- websiteUrl: Official artist website URL. Return null if not present.",
  "- instagramUrl: Full https:// Instagram profile URL. Return null if not present.",
  "- twitterUrl: Full https:// Twitter or X profile URL. Return null if not present.",
  "- nationality: Country of origin or citizenship as a plain string. Return null if not stated.",
  "- birthYear: Four-digit integer birth year only. Return null if not stated or only a decade is given.",
  "",
  "If the page is a 404, stub, login wall, or clearly unrelated to the artist, return null for all fields.",
  "If the page is a search results page rather than a profile page, extract from the most relevant snippet only.",
].join("\n");

const artistExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "bio", "mediums", "websiteUrl", "instagramUrl", "twitterUrl", "nationality", "birthYear"],
  properties: {
    name: { anyOf: [{ type: "string" }, { type: "null" }] },
    bio: { anyOf: [{ type: "string" }, { type: "null" }] },
    mediums: { type: "array", items: { type: "string" } },
    websiteUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    instagramUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    twitterUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    nationality: { anyOf: [{ type: "string" }, { type: "null" }] },
    birthYear: { anyOf: [{ type: "integer" }, { type: "null" }] },
  },
} as const;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: { openAiApiKey?: string | null; geminiApiKey?: string | null; anthropicApiKey?: string | null },
  env: NodeJS.ProcessEnv,
): string {
  switch (provider) {
    case "gemini": {
      const key = settings.geminiApiKey ?? env.GEMINI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Gemini provider selected but GEMINI_API_KEY is not set");
      return key;
    }
    case "claude": {
      const key = settings.anthropicApiKey ?? env.ANTHROPIC_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Claude provider selected but ANTHROPIC_API_KEY is not set");
      return key;
    }
    default: {
      const key = settings.openAiApiKey ?? env.OPENAI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "OpenAI provider selected but OPENAI_API_KEY is not set");
      return key;
    }
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeDiscoveryErrorCode(error: unknown, fallback: string): string {
  if (error instanceof IngestError) {
    const mapped = error.code.toLowerCase();
    switch (mapped) {
      case "fetch_timeout":
        return "provider_timeout";
      case "fetch_failed":
      case "provider_error":
        return "provider_failed";
      case "config_error":
        return "model_failed";
      default:
        return mapped;
    }
  }

  return fallback;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

type SearchItem = { link: string; title: string; snippet: string };

function buildSnippetContent(items: SearchItem[], artistName: string): string {
  const body = items
    .slice(0, 3)
    .map((item) => `${item.title}\n${item.snippet}`)
    .filter(Boolean)
    .join("\n\n");
  return `Artist: ${artistName}\n\nSearch result summaries:\n${body}`;
}

function snippetsSufficient(items: SearchItem[]): boolean {
  const combined = items.map((item) => item.snippet).join(" ").trim();
  return combined.length >= 120;
}

export function buildArtistSearchQuery(args: {
  artistName: string;
  eventTitle?: string | null;
  venueName?: string | null;
}): string {
  const name = args.artistName.trim();
  const words = name.split(/\s+/);

  if (words.length <= 2) {
    if (args.venueName) {
      return `"${name}" artist ${args.venueName}`;
    }
    if (args.eventTitle) {
      return `"${name}" artist ${args.eventTitle}`;
    }
  }

  return `${name} artist`;
}

type ArtistDiscoveryDb = Pick<Prisma.TransactionClient, "artist" | "eventArtist" | "ingestExtractedArtist" | "ingestExtractedArtistEvent" | "ingestExtractedArtistRun"> & {
  siteSettings?: {
    findUnique: (args: {
      where: { id: string };
      select: { regionAutoPublishArtists: true };
    }) => Promise<{ regionAutoPublishArtists: boolean } | null>;
  };
  $transaction?: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

export async function discoverArtist(args: {
  db: ArtistDiscoveryDb;
  artistName: string;
  eventId: string;
  eventTitle?: string | null;
  venueName?: string | null;
  knownProfileUrl?: string | null;
  settings: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    artistLookupProvider?: string | null;
    artistBioProvider?: string | null;
    geminiApiKey?: string | null;
    anthropicApiKey?: string | null;
    openAiApiKey?: string | null;
    artistBioSystemPrompt?: string | null;
  };
}): Promise<{ status: "created" | "linked" | "skipped"; candidateId?: string }> {
  const normalizedName = normalizeName(args.artistName);
  if (!normalizedName) return { status: "skipped" };

  const existingArtist = await args.db.artist.findFirst({
    where: {
      name: { equals: args.artistName.trim(), mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existingArtist) {
    await args.db.eventArtist.upsert({
      where: { eventId_artistId: { eventId: args.eventId, artistId: existingArtist.id } },
      create: { eventId: args.eventId, artistId: existingArtist.id },
      update: {},
    });
    return { status: "linked" };
  }

  const fingerprint = createHash("sha256").update(normalizedName).digest("hex");

  const existingCandidate = await args.db.ingestExtractedArtist.findFirst({
    where: { fingerprint, status: "PENDING" },
    select: { id: true },
  });

  if (existingCandidate) {
    await args.db.ingestExtractedArtistEvent.upsert({
      where: {
        artistCandidateId_eventId: {
          artistCandidateId: existingCandidate.id,
          eventId: args.eventId,
        },
      },
      create: {
        artistCandidateId: existingCandidate.id,
        eventId: args.eventId,
      },
      update: {},
    });

    return { status: "linked", candidateId: existingCandidate.id };
  }

  const searchQuery = buildArtistSearchQuery({
    artistName: args.artistName,
    eventTitle: args.eventTitle,
    venueName: args.venueName,
  });
  const attemptedAt = new Date();
  const attemptStart = Date.now();
  let searchItems: SearchItem[] = [];
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let sourceUrl: string;

  if (args.knownProfileUrl) {
    sourceUrl = args.knownProfileUrl;
  } else {
    if (args.settings.googlePseApiKey && args.settings.googlePseCx) {
      try {
        const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
        endpoint.searchParams.set("key", args.settings.googlePseApiKey);
        endpoint.searchParams.set("cx", args.settings.googlePseCx);
        endpoint.searchParams.set("q", searchQuery);
        endpoint.searchParams.set("num", "5");

        const response = await fetch(endpoint.toString());
        if (response.ok) {
          const body = (await response.json()) as { items?: Array<{ link?: string; title?: string; snippet?: string }> };
          searchItems = (body.items ?? [])
            .filter((item): item is { link: string; title?: string; snippet?: string } => typeof item.link === "string")
            .map((item) => ({ link: item.link, title: item.title ?? "", snippet: item.snippet ?? "" }));
        }
      } catch (error) {
        searchItems = [];
        errorCode = normalizeDiscoveryErrorCode(error, "search_failed");
        errorMessage = toErrorMessage(error, "Search provider request failed");
      }
    } else {
      logWarn({ message: "artist_discovery_google_pse_missing" });
    }

    const wikipediaItem = searchItems.find((item) => item.link.includes("wikipedia.org"));
    const nonSocialItem = searchItems.find((item) => !/(twitter\.com|instagram\.com|facebook\.com|tiktok\.com)/i.test(item.link));
    const venuePageItem = args.venueName
      ? searchItems.find((item) => {
        try {
          const hostname = new URL(item.link).hostname.toLowerCase();
          const venueSlug = args.venueName!.toLowerCase().replace(/[^a-z0-9]/g, "");
          return hostname.replace(/[^a-z0-9]/g, "").includes(venueSlug);
        } catch {
          return false;
        }
      })
      : undefined;

    sourceUrl = venuePageItem?.link
      ?? wikipediaItem?.link
      ?? nonSocialItem?.link
      ?? searchItems[0]?.link
      ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(args.artistName)}`;
  }

  const wikipediaMatch = searchItems.some((item) => item.link.includes("wikipedia.org"));

  let html = "";
  if (snippetsSufficient(searchItems)) {
    html = buildSnippetContent(searchItems, args.artistName);
  } else {
    try {
      await assertSafeUrl(sourceUrl);
      const fetched = await fetchHtmlWithGuards(sourceUrl);
      html = fetched.html;
    } catch {
      html = "";
    }
  }

  const provider = getProvider((args.settings.artistBioProvider as ProviderName | null) ?? "claude");
  let chosenProvider = provider;

  let apiKey = "";
  try {
    apiKey = resolveProviderApiKey(provider.name, args.settings, process.env);
  } catch (error) {
    try {
      chosenProvider = getProvider("openai");
      apiKey = resolveProviderApiKey("openai", args.settings, process.env);
    } catch {
      errorCode = normalizeDiscoveryErrorCode(error, "model_failed");
      errorMessage = toErrorMessage(error, "Model provider configuration failed");
    }
  }

  let extracted: {
    name: string | null;
    bio: string | null;
    mediums: string[];
    websiteUrl: string | null;
    instagramUrl: string | null;
    twitterUrl: string | null;
    nationality: string | null;
    birthYear: number | null;
  } = {
    name: null,
    bio: null,
    mediums: [],
    websiteUrl: null,
    instagramUrl: null,
    twitterUrl: null,
    nationality: null,
    birthYear: null,
  };

  let usageTotalTokens: number | null = null;
  let extractedModel = "";

  const artistBioSystemPrompt =
    args.settings.artistBioSystemPrompt?.trim() || DEFAULT_ARTIST_BIO_SYSTEM_PROMPT;

  if (apiKey) {
    try {
      const result = await chosenProvider.extract({
        html: html || `Artist name: ${args.artistName}`,
        sourceUrl,
        systemPrompt: artistBioSystemPrompt,
        jsonSchema: artistExtractionSchema,
        model: "",
        apiKey,
      });

      extractedModel = result.model;
      usageTotalTokens = result.usage.totalTokens ?? null;

      if (result.raw && typeof result.raw === "object") {
        const raw = result.raw as Record<string, unknown>;
        extracted = {
          name: asString(raw.name),
          bio: asString(raw.bio),
          mediums: asStringArray(raw.mediums),
          websiteUrl: asString(raw.websiteUrl),
          instagramUrl: asString(raw.instagramUrl),
          twitterUrl: asString(raw.twitterUrl),
          nationality: asString(raw.nationality),
          birthYear: asInteger(raw.birthYear),
        };
      }
    } catch (error) {
      errorCode = normalizeDiscoveryErrorCode(error, "model_failed");
      errorMessage = toErrorMessage(error, "Model extraction failed");
      extracted = {
        name: null,
        bio: null,
        mediums: [],
        websiteUrl: null,
        instagramUrl: null,
        twitterUrl: null,
        nationality: null,
        birthYear: null,
      };
    }
  } else {
    extracted = {
      name: null,
      bio: null,
      mediums: [],
      websiteUrl: null,
      instagramUrl: null,
      twitterUrl: null,
      nationality: null,
      birthYear: null,
    };
  }

  const scored = scoreArtistCandidate({
    bio: extracted.bio,
    websiteUrl: extracted.websiteUrl,
    instagramUrl: extracted.instagramUrl,
    twitterUrl: extracted.twitterUrl,
    mediums: extracted.mediums,
    birthYear: extracted.birthYear,
    name: extracted.name ?? args.artistName,
    searchQuery,
    wikipediaMatch,
  });

  const candidateName = extracted.name?.trim() || args.artistName.trim();

  const createRows = async (tx: Pick<Prisma.TransactionClient, "ingestExtractedArtist" | "ingestExtractedArtistRun" | "ingestExtractedArtistEvent">) => {
    const candidate = await tx.ingestExtractedArtist.create({
      data: {
        name: candidateName,
        normalizedName,
        bio: extracted.bio,
        mediums: extracted.mediums,
        websiteUrl: extracted.websiteUrl,
        instagramUrl: extracted.instagramUrl,
        twitterUrl: extracted.twitterUrl,
        nationality: extracted.nationality,
        birthYear: extracted.birthYear,
        sourceUrl,
        searchQuery,
        status: "PENDING",
        fingerprint,
        confidenceScore: scored.score,
        confidenceBand: scored.band,
        confidenceReasons: scored.reasons as Prisma.JsonArray,
        extractionProvider: chosenProvider.name,
      },
      select: { id: true },
    });

    await tx.ingestExtractedArtistRun.create({
      data: {
        artistCandidateId: candidate.id,
        searchResults: searchItems as Prisma.JsonArray,
        model: extractedModel || chosenProvider.name,
        usageTotalTokens,
        attemptedAt,
        durationMs: Date.now() - attemptStart,
        errorCode,
        errorMessage,
      },
    });

    await tx.ingestExtractedArtistEvent.create({
      data: {
        artistCandidateId: candidate.id,
        eventId: args.eventId,
      },
    });

    return candidate;
  };

  const created = args.db.$transaction
    ? await args.db.$transaction((tx) => createRows(tx))
    : await createRows(args.db);

  const settings = await args.db.siteSettings?.findUnique({
    where: { id: "default" },
    select: { regionAutoPublishArtists: true },
  });
  if (settings?.regionAutoPublishArtists) {
    await autoApproveArtistCandidate({
      candidateId: created.id,
      db: args.db as unknown as PrismaClient,
      autoPublish: true,
    }).catch((err) => logWarn({ message: "auto_approve_artist_post_discovery_failed", err }));
  }

  return { status: "created", candidateId: created.id };
}
