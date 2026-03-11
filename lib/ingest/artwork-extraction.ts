import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { scoreArtworkCandidate } from "@/lib/ingest/artwork-confidence";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { autoApproveArtworkCandidate } from "@/lib/ingest/auto-approve-artwork-candidate";

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
          medium: { type: ["string", "null"] },
          year: { type: ["integer", "null"] },
          dimensions: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          imageUrl: { type: ["string", "null"] },
          artistName: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const systemPrompt = "You are an expert art cataloguer. Extract all artworks mentioned or displayed on this exhibition page. For each artwork extract: title, medium (e.g. 'oil on canvas', 'archival pigment print'), year, dimensions (raw string e.g. '120 × 90 cm'), a brief description of the work, an image URL if visible, and the artist name. Only extract real artworks — do not invent or hallucinate. If a field is not present on the page, return null for that field.";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
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

    const provider = getProvider((args.settings.artworkExtractionProvider as ProviderName | null) ?? "claude");
    const apiKey = resolveProviderApiKey(provider.name, args.settings);

    const result = await provider.extract({
      html: preprocessHtml(fetched.html),
      sourceUrl: args.sourceUrl,
      systemPrompt,
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

      const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
      const fingerprint = createHash("sha256").update(`${args.eventId}:${normalizedTitle}`).digest("hex");

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
        imageUrl: asString(artwork.imageUrl),
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
        },
      });

      createdArtworks.push({ id: createdArtwork.id });
      created += 1;
    }

    const artworkSettings = await args.db.siteSettings.findUnique({
      where: { id: "default" },
      select: { regionAutoPublishArtworks: true },
    });
    if (artworkSettings?.regionAutoPublishArtworks) {
      for (const artwork of createdArtworks) {
        await autoApproveArtworkCandidate({
          candidateId: artwork.id,
          db: args.db,
          autoPublish: true,
        }).catch((err) => console.warn("auto_approve_artwork_post_extraction_failed", { err }));
      }
    }

    return { created, duplicates, skipped: 0 };
  } catch (error) {
    console.error("[artwork-extraction] unexpected error", error);
    return { created: 0, duplicates: 0, skipped: 1 };
  }
}
