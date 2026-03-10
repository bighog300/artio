import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { IngestError } from "@/lib/ingest/errors";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { scoreArtistCandidate } from "@/lib/ingest/artist-confidence";

const artistExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "bio", "mediums", "websiteUrl", "instagramUrl", "twitterUrl", "nationality", "birthYear"],
  properties: {
    name: { type: ["string", "null"] },
    bio: { type: ["string", "null"] },
    mediums: { type: "array", items: { type: "string" } },
    websiteUrl: { type: ["string", "null"] },
    instagramUrl: { type: ["string", "null"] },
    twitterUrl: { type: ["string", "null"] },
    nationality: { type: ["string", "null"] },
    birthYear: { type: ["integer", "null"] },
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

type SearchItem = { link: string; title: string; snippet: string };

type ArtistDiscoveryDb = Pick<Prisma.TransactionClient, "artist" | "eventArtist" | "ingestExtractedArtist" | "ingestExtractedArtistEvent" | "ingestExtractedArtistRun"> & {
  $transaction?: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

export async function discoverArtist(args: {
  db: ArtistDiscoveryDb;
  artistName: string;
  eventId: string;
  settings: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    artistLookupProvider?: string | null;
    artistBioProvider?: string | null;
    geminiApiKey?: string | null;
    anthropicApiKey?: string | null;
    openAiApiKey?: string | null;
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

  const searchQuery = `${args.artistName} artist`;
  let searchItems: SearchItem[] = [];

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
    } catch {
      searchItems = [];
    }
  } else {
    console.warn("[artist-discovery] google PSE key/cx missing");
  }

  const wikipediaMatch = searchItems.some((item) => item.link.includes("wikipedia.org"));
  const wikipediaItem = searchItems.find((item) => item.link.includes("wikipedia.org"));
  const nonSocialItem = searchItems.find((item) => !/(twitter\.com|instagram\.com|facebook\.com|tiktok\.com)/i.test(item.link));

  const sourceUrl = wikipediaItem?.link
    ?? nonSocialItem?.link
    ?? searchItems[0]?.link
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(args.artistName)}`;

  let html = "";
  try {
    await assertSafeUrl(sourceUrl);
    const fetched = await fetchHtmlWithGuards(sourceUrl);
    html = fetched.html;
  } catch {
    html = "";
  }

  const provider = getProvider((args.settings.artistBioProvider as ProviderName | null) ?? "claude");
  let chosenProvider = provider;

  let apiKey = "";
  try {
    apiKey = resolveProviderApiKey(provider.name, args.settings, process.env);
  } catch {
    chosenProvider = getProvider("openai");
    apiKey = resolveProviderApiKey("openai", args.settings, process.env);
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

  try {
    const result = await chosenProvider.extract({
      html: html || `Artist name: ${args.artistName}`,
      sourceUrl,
      systemPrompt: "Extract the artist profile from the following page HTML. Return only the structured data requested. If a field is not present on the page, return null for that field.",
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
  } catch {
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

  return { status: "created", candidateId: created.id };
}
