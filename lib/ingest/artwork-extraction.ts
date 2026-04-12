import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { classifyPageImages, pickBestImages } from "@/lib/ingest/classify-image";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { scoreArtworkCandidate } from "@/lib/ingest/artwork-confidence";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { autoApproveArtworkCandidate } from "@/lib/ingest/auto-approve-artwork-candidate";
import { resolveRelativeHttpUrl } from "@/lib/ingest/url-utils";
import { logError, logWarn } from "@/lib/logging";

const artworkExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artworks"],
  properties: {
    artworks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "medium", "year", "dimensions", "description", "imageUrl", "artistName"],
        properties: {
          title: { type: "string" },
          medium: { anyOf: [{ type: "string" }, { type: "null" }] },
          year: { anyOf: [{ type: "integer" }, { type: "null" }] },
          dimensions: { anyOf: [{ type: "string" }, { type: "null" }] },
          description: { anyOf: [{ type: "string" }, { type: "null" }] },
          imageUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
          artistName: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

export const DEFAULT_ARTWORK_SYSTEM_PROMPT =
  "You are an expert art cataloguer. Extract all artworks mentioned or " +
  "displayed on this exhibition page. For each artwork extract: title, " +
  "medium (e.g. 'oil on canvas', 'archival pigment print'), year, " +
  "dimensions (raw string e.g. '120 × 90 cm'), a brief description of " +
  "the work, an image URL if visible, and the artist name. Only extract " +
  "real artworks — do not invent or hallucinate. If a field is not " +
  "present on the page, return null for that field.";

export const ARTIST_PROFILE_ARTWORK_SYSTEM_PROMPT =
  "You are an expert art cataloguer extracting artworks from an artist's profile page on an art directory website. " +
  "The page shows a gallery of this artist's works. " +
  "For each artwork extract: " +
  "title (the artwork name, not the artist name), " +
  "medium (e.g. 'Oil on canvas', 'Bronze sculpture', 'Archival pigment print'), " +
  "year (integer, e.g. 2019), " +
  "dimensions (raw string e.g. '90 × 120 cm'), " +
  "imageUrl (the full URL of the artwork image — look for high-resolution src or data-src attributes, not thumbnails), " +
  "artistName (the artist whose profile this is — same for all artworks on this page). " +
  "Do not extract profile photos, banner images, or site UI elements. " +
  "Only extract actual artworks. If a field is not visible return null. " +
  "If no artworks are found return an empty array.";

function resolveArtworkSystemPrompt(override?: string | null): string {
  const trimmed = override?.trim();
  return trimmed || DEFAULT_ARTWORK_SYSTEM_PROMPT;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function normalizeFingerprintField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeArtworkFingerprint(args: {
  eventId: string;
  sourceUrl: string;
  artwork: {
    title: string | null;
    artistName: string | null;
    year: number | null;
    dimensions: string | null;
  };
}): string {
  const fingerprintParts = [
    args.eventId,
    normalizeFingerprintField(args.artwork.title),
    normalizeFingerprintField(args.artwork.artistName),
    normalizeFingerprintField(args.artwork.year),
    normalizeFingerprintField(args.artwork.dimensions),
    normalizeFingerprintField(args.sourceUrl),
  ].join("|");

  return createHash("sha256").update(fingerprintParts).digest("hex");
}

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: {
    claudeApiKey?: string | null;
    anthropicApiKey?: string | null;
    geminiApiKey?: string | null;
    openAiApiKey?: string | null;
  },
): string {
  switch (provider) {
    case "claude": {
      const key = settings.claudeApiKey ?? settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Claude provider selected but ANTHROPIC_API_KEY is not set");
      return key;
    }
    case "gemini": {
      const key = settings.geminiApiKey ?? process.env.GEMINI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Gemini provider selected but GEMINI_API_KEY is not set");
      return key;
    }
    default: {
      const key = settings.openAiApiKey ?? process.env.OPENAI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "OpenAI provider selected but OPENAI_API_KEY is not set");
      return key;
    }
  }
}

export async function extractArtworksForEvent(args: {
  db: PrismaClient;
  eventId: string;
  sourceUrl: string;
  systemPromptOverride?: string | null;
  matchedArtistId?: string | null;
  settings: {
    artworkExtractionProvider?: string | null;
    claudeApiKey?: string | null;
    anthropicApiKey?: string | null;
    geminiApiKey?: string | null;
    openAiApiKey?: string | null;
  };
}): Promise<{ created: number; duplicates: number; skipped: number }> {
  try {
    try {
      await assertSafeUrl(args.sourceUrl);
    } catch {
      return { created: 0, duplicates: 0, skipped: 1 };
    }

    let fetched;
    try {
      fetched = await fetchHtmlWithGuards(args.sourceUrl);
    } catch {
      return { created: 0, duplicates: 0, skipped: 1 };
    }

    const settings = await args.db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        regionAutoPublishArtworks: true,
        artworkExtractionSystemPrompt: true,
      },
    });

    const provider = getProvider((args.settings.artworkExtractionProvider as ProviderName | null) ?? "claude");
    const apiKey = resolveProviderApiKey(provider.name, args.settings);

    const processedHtml = preprocessHtml(fetched.html);
    const pageImages = classifyPageImages(fetched.html, args.sourceUrl);
    const { artwork: artworkImages } = pickBestImages(pageImages);
    const artworkImageHints = artworkImages.slice(0, 10).map((img) => img.url);
    const imageHintBlock = artworkImageHints.length > 0
      ? `

Pre-classified artwork images found on this page:
${artworkImageHints.join("\n")}`
      : "";

    const result = await provider.extract({
      html: processedHtml + imageHintBlock,
      sourceUrl: args.sourceUrl,
      systemPrompt: resolveArtworkSystemPrompt(args.systemPromptOverride ?? settings?.artworkExtractionSystemPrompt),
      jsonSchema: artworkExtractionSchema,
      model: "",
      apiKey,
    });

    if (!result.raw || typeof result.raw !== "object") return { created: 0, duplicates: 0, skipped: 1 };
    const raw = result.raw as { artworks?: unknown };
    if (!Array.isArray(raw.artworks)) return { created: 0, duplicates: 0, skipped: 1 };

    let created = 0;
    let duplicates = 0;
    const createdArtworks: Array<{ id: string }> = [];

    for (const item of raw.artworks) {
      if (!item || typeof item !== "object") continue;
      const artwork = item as Record<string, unknown>;
      const title = asString(artwork.title);
      if (!title) continue;

      // NOTE: fingerprint formula changed — existing rows from before this deploy may re-ingest as new candidates on next run.
      const fingerprint = computeArtworkFingerprint({
        eventId: args.eventId,
        sourceUrl: args.sourceUrl,
        artwork: {
          title,
          artistName: asString(artwork.artistName),
          year: asInteger(artwork.year),
          dimensions: asString(artwork.dimensions),
        },
      });

      const existing = await args.db.ingestExtractedArtwork.findUnique({ where: { fingerprint }, select: { id: true } });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const candidate = {
        title,
        medium: asString(artwork.medium),
        year: asInteger(artwork.year),
        dimensions: asString(artwork.dimensions),
        description: asString(artwork.description),
        imageUrl: resolveRelativeHttpUrl(asString(artwork.imageUrl), args.sourceUrl),
        artistName: asString(artwork.artistName),
      };

      const scored = scoreArtworkCandidate(candidate);

      const createdArtwork = await args.db.ingestExtractedArtwork.create({
        data: {
          ...candidate,
          sourceEventId: args.eventId,
          sourceUrl: args.sourceUrl,
          fingerprint,
          confidenceScore: scored.score,
          confidenceBand: scored.band,
          confidenceReasons: scored.reasons,
          extractionProvider: provider.name,
          status: "PENDING",
          matchedArtistId: args.matchedArtistId ?? null,
        },
      });

      createdArtworks.push({ id: createdArtwork.id });
      created += 1;
    }

    if (settings?.regionAutoPublishArtworks) {
      for (const artwork of createdArtworks) {
        await autoApproveArtworkCandidate({
          candidateId: artwork.id,
          db: args.db,
          autoPublish: true,
        }).catch((err) => logWarn({ message: "auto_approve_artwork_post_extraction_failed", err }));
      }
    }

    return { created, duplicates, skipped: 0 };
  } catch (error) {
    logError({ message: "artwork_extraction_unexpected_error", error });
    return { created: 0, duplicates: 0, skipped: 1 };
  }
}
