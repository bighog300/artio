import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { IngestError } from "@/lib/ingest/errors";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { extractEventsWithOpenAI, type ExtractUsage, type VenueSnapshot } from "@/lib/ingest/openai-extract";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadCandidateImageToBlob } from "@/lib/blob/upload-image";
import { computeConfidence, sanitizeReasons } from "@/lib/ingest/confidence";
import { extractJsonLdEvents } from "@/lib/ingest/jsonld-extract";
import { parseExtractedEventsFromModel, type NormalizedExtractedEvent } from "@/lib/ingest/schemas";
import { clusterCandidates, computeSimilarityKey, scoreSimilarity } from "@/lib/ingest/similarity";
import { inferTimezoneFromLatLng } from "@/lib/timezone";
import { detectPlatform, getPlatformPromptHint, isJsRenderedPlatform, type Platform } from "@/lib/ingest/detect-platform";


function resolveRelativeImageUrl(imageUrl: string | null | undefined, baseUrl: string): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch {
    return imageUrl;
  }
}

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_ERROR_DETAIL_LENGTH = 1000;
const DEFAULT_MAX_CANDIDATES_PER_RUN = 25;
const DEFAULT_DUPLICATE_LOOKBACK_DAYS = 30;
const DEFAULT_DURATION_MINUTES = 120;

const CANDIDATE_CAP_STOP_REASON = "CANDIDATE_CAP_REACHED";

type RunIngestParams = {
  venueId: string;
  sourceUrl: string; // prefer venue.eventsPageUrl ?? venue.websiteUrl
  model?: string;
};

type Extractor = typeof extractEventsWithOpenAI;
type Fetcher = typeof fetchHtmlWithGuards;
type JsonLdExtractor = typeof extractJsonLdEvents;

type IngestStore = {
  ingestRun: {
    create: typeof db.ingestRun.create;
    update: (args: { where: { id: string }; data: Record<string, unknown> & { detectedPlatform?: string | null } }) => Promise<unknown>;
  };
  ingestExtractedEvent: {
    findUnique: typeof db.ingestExtractedEvent.findUnique;
    findMany: typeof db.ingestExtractedEvent.findMany;
    create: typeof db.ingestExtractedEvent.create;
    update: typeof db.ingestExtractedEvent.update;
  };
  venue: {
    findUnique: typeof db.venue.findUnique;
  };
  siteSettings: {
    findUnique: typeof db.siteSettings.findUnique;
  };
};

function truncateMessage(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength)}…` : input;
}

function normalizeText(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dayStamp(input: Date | null): string {
  if (!input) return "unknown";
  return input.toISOString().slice(0, 10);
}

function fingerprintForCandidate(params: { venueId: string; title: string; startAt: Date | null; locationText: string | null }): string {
  const signature = [params.venueId, normalizeText(params.title), dayStamp(params.startAt), normalizeText(params.locationText)].join("|");
  return createHash("sha256").update(signature).digest("hex");
}

function getMaxCandidatesPerVenueRun() {
  const parsed = Number.parseInt(process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_CANDIDATES_PER_RUN;
}

function getDuplicateLookbackDays() {
  const parsed = Number.parseInt(process.env.AI_INGEST_DUPLICATE_LOOKBACK_DAYS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_DUPLICATE_LOOKBACK_DAYS;
}

function getDefaultDurationMinutes() {
  const parsed = Number.parseInt(process.env.AI_INGEST_DEFAULT_DURATION_MINUTES ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_DURATION_MINUTES;
}

function isUkSourceUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return hostname.endsWith(".uk");
  } catch {
    return false;
  }
}

function isUkCountry(input: string | null | undefined): boolean {
  if (!input) return false;
  const normalized = input.trim().toLowerCase();
  return normalized === "uk" || normalized === "gb" || normalized === "united kingdom";
}

function normalizeSchedulingFields(
  event: NormalizedExtractedEvent,
  context: { fallbackSourceUrl: string; venueCountry: string | null; venueLat?: number | null; venueLng?: number | null },
): NormalizedExtractedEvent {
  const startAt = event.startAt;
  if (!startAt) return event;

  const normalized: NormalizedExtractedEvent = { ...event };
  const durationMs = getDefaultDurationMinutes() * 60 * 1000;

  if (!normalized.endAt || normalized.endAt < startAt) {
    normalized.endAt = new Date(startAt.getTime() + durationMs);
  }

  if (!normalized.timezone) {
    const sourceToCheck = normalized.sourceUrl ?? context.fallbackSourceUrl;
    if (isUkSourceUrl(sourceToCheck) || isUkCountry(context.venueCountry)) {
      normalized.timezone = "Europe/London";
    }
  }

  if (!normalized.timezone && context.venueLat != null && context.venueLng != null) {
    normalized.timezone = inferTimezoneFromLatLng(context.venueLat, context.venueLng);
  }

  return normalized;
}

async function markRunFailed(
  store: IngestStore,
  runId: string,
  startedAtMs: number,
  errorCode: string,
  errorMessage: string,
  errorDetail?: unknown,
  detectedPlatform?: Platform | null,
) {
  const finishedAt = new Date();
  await store.ingestRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt,
      durationMs: finishedAt.getTime() - startedAtMs,
      errorCode,
      errorMessage: truncateMessage(errorMessage, MAX_ERROR_MESSAGE_LENGTH),
      errorDetail: errorDetail ? truncateMessage(String(errorDetail), MAX_ERROR_DETAIL_LENGTH) : undefined,
      detectedPlatform,
    },
  });
}

type PendingCandidate = {
  tempId: string;
  event: NormalizedExtractedEvent;
  fingerprint: string;
  similarityKey: string;
};

export async function runVenueIngestExtraction(
  params: RunIngestParams,
  deps: {
    store?: IngestStore;
    fetchHtml?: Fetcher;
    extractWithOpenAI?: Extractor;
    extractJsonLd?: JsonLdExtractor;
    now?: () => number;
    assertSafeUrl?: typeof assertSafeUrl;
    fetchImageWithGuards?: typeof fetchImageWithGuards;
    uploadCandidateImageToBlob?: typeof uploadCandidateImageToBlob;
    detectPlatformFn?: typeof detectPlatform;
  } = {},
): Promise<{ runId: string; createdCount: number; dedupedCount: number; createdDuplicateCount: number; stopReason: string | null }> {
  const store = (deps.store ?? db) as IngestStore;
  const fetchHtml = deps.fetchHtml ?? fetchHtmlWithGuards;
  const extractWithOpenAI = deps.extractWithOpenAI ?? extractEventsWithOpenAI;
  const extractJsonLd = deps.extractJsonLd ?? extractJsonLdEvents;
  const now = deps.now ?? Date.now;
  const assertSafeUrlImpl = deps.assertSafeUrl ?? assertSafeUrl;
  const fetchImageWithGuardsImpl = deps.fetchImageWithGuards ?? fetchImageWithGuards;
  const uploadCandidateImageToBlobImpl = deps.uploadCandidateImageToBlob ?? uploadCandidateImageToBlob;
  const detectPlatformFn = deps.detectPlatformFn ?? detectPlatform;
  const startedAtMs = now();
  let detectedPlatform: Platform | null = null;

  const run = await store.ingestRun.create({
    data: {
      venueId: params.venueId,
      sourceUrl: params.sourceUrl,
      status: "RUNNING",
      startedAt: new Date(startedAtMs),
    },
  });

  try {
    const fetched = await fetchHtml(params.sourceUrl);

    await store.ingestRun.update({
      where: { id: run.id },
      data: {
        fetchFinalUrl: fetched.finalUrl,
        fetchStatus: fetched.status,
        fetchContentType: fetched.contentType,
        fetchBytes: fetched.bytes,
      },
    });

    detectedPlatform = detectPlatformFn(fetched.html, fetched.finalUrl);

    if (isJsRenderedPlatform(detectedPlatform)) {
      const finishedAt = new Date(now());
      await store.ingestRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          finishedAt,
          durationMs: finishedAt.getTime() - startedAtMs,
          createdCandidates: 0,
          createdDuplicates: 0,
          dedupedCandidates: 0,
          totalCandidatesReturned: 0,
          detectedPlatform,
          stopReason: "PLATFORM_REQUIRES_JS",
        },
      });
      return { runId: run.id, createdCount: 0, dedupedCount: 0, createdDuplicateCount: 0, stopReason: "PLATFORM_REQUIRES_JS" };
    }

    const venue = await store.venue.findUnique({
      where: { id: params.venueId },
      select: {
        country: true,
        name: true,
        addressLine1: true,
        city: true,
        eventsPageUrl: true,
        lat: true,
        lng: true,
      },
    });

    const jsonLdResult = extractJsonLd(fetched.html, fetched.finalUrl);

    let normalized: NormalizedExtractedEvent[];
    let extractionMethod: "json_ld" | "openai";
    let extractedModel: string | null = null;
    let extractedUsage: ExtractUsage | undefined;
    let extractedVenueSnapshot: VenueSnapshot = {};

    if (jsonLdResult.attempted && jsonLdResult.events.length > 0) {
      extractionMethod = "json_ld";
      normalized = jsonLdResult.events.map((event) => normalizeSchedulingFields(event, {
        fallbackSourceUrl: fetched.finalUrl,
        venueCountry: venue?.country ?? null,
        venueLat: venue?.lat ?? null,
        venueLng: venue?.lng ?? null,
      }));
    } else {
      if (process.env.AI_INGEST_ENABLED !== "1") {
        await markRunFailed(store, run.id, startedAtMs, "INGEST_DISABLED", "AI ingest is disabled");
        return { runId: run.id, createdCount: 0, dedupedCount: 0, createdDuplicateCount: 0, stopReason: null };
      }

      if (!process.env.OPENAI_API_KEY) {
        await markRunFailed(store, run.id, startedAtMs, "MISSING_OPENAI_KEY", "OPENAI_API_KEY is not configured");
        return { runId: run.id, createdCount: 0, dedupedCount: 0, createdDuplicateCount: 0, stopReason: null };
      }

      const settings = await store.siteSettings.findUnique({
        where: { id: "default" },
        select: {
          ingestSystemPrompt: true,
          ingestModel: true,
          ingestMaxOutputTokens: true,
        },
      });

      const extracted = await extractWithOpenAI({
        html: fetched.html,
        sourceUrl: fetched.finalUrl,
        model: params.model,
        systemPromptOverride: settings?.ingestSystemPrompt ?? null,
        modelOverride: settings?.ingestModel ?? null,
        maxOutputTokensOverride: settings?.ingestMaxOutputTokens ?? null,
        platformHint: getPlatformPromptHint(detectedPlatform),
        venueContext: venue
          ? {
              name: venue.name,
              address: [venue.addressLine1, venue.city].filter(Boolean).join(", ") || null,
            }
          : undefined,
      });
      normalized = parseExtractedEventsFromModel(extracted.events).map((event) => normalizeSchedulingFields(event, {
        fallbackSourceUrl: fetched.finalUrl,
        venueCountry: venue?.country ?? null,
        venueLat: venue?.lat ?? null,
        venueLng: venue?.lng ?? null,
      }));
      extractionMethod = "openai";
      extractedModel = extracted.model;
      extractedUsage = extracted.usage;
      extractedVenueSnapshot = extracted.venueSnapshot;
    }
    const totalCandidatesReturned = normalized.length;
    const maxCandidates = getMaxCandidatesPerVenueRun();
    const cappedCandidates = normalized.slice(0, maxCandidates);
    const stopReason = totalCandidatesReturned > maxCandidates ? CANDIDATE_CAP_STOP_REASON : null;

    let dedupedCount = 0;
    const candidates: PendingCandidate[] = [];

    for (const [index, event] of cappedCandidates.entries()) {
      const fingerprint = fingerprintForCandidate({
        venueId: params.venueId,
        title: event.title,
        startAt: event.startAt,
        locationText: event.locationText,
      });

      const existing = await store.ingestExtractedEvent.findUnique({
        where: {
          venueId_fingerprint: {
            venueId: params.venueId,
            fingerprint,
          },
        },
        select: { id: true },
      });

      if (existing) {
        dedupedCount += 1;
        continue;
      }

      candidates.push({
        tempId: `new-${index}`,
        event,
        fingerprint,
        similarityKey: computeSimilarityKey(event),
      });
    }

    const clustered = clusterCandidates(
      candidates.map((candidate) => ({
        id: candidate.tempId,
        venueId: params.venueId,
        title: candidate.event.title,
        startAt: candidate.event.startAt,
        locationText: candidate.event.locationText,
        similarityKey: candidate.similarityKey,
      })),
    );

    const assignmentById = new Map(clustered.assignments.map((assignment) => [assignment.id, assignment]));

    const lookbackStart = new Date(now() - getDuplicateLookbackDays() * 24 * 60 * 60 * 1000);
    const historicalPrimaries = await store.ingestExtractedEvent.findMany({
      where: {
        venueId: params.venueId,
        createdAt: { gte: lookbackStart },
        status: { in: ["PENDING", "APPROVED"] },
        duplicateOfId: null,
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        locationText: true,
        similarityKey: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const historicalLinkByTempId = new Map<string, { duplicateOfId: string; similarityScore: number }>();

    for (const candidate of candidates) {
      const assignment = assignmentById.get(candidate.tempId);
      if (!assignment || !assignment.isPrimary) continue;

      let best: { id: string; score: number } | null = null;
      for (const historical of historicalPrimaries) {
        const score = historical.similarityKey === candidate.similarityKey
          ? 100
          : scoreSimilarity(candidate.event, {
            title: historical.title,
            startAt: historical.startAt,
            locationText: historical.locationText,
          });

        if (!best || score > best.score || (score === best.score && historical.id < best.id)) {
          best = { id: historical.id, score };
        }
      }

      const threshold = Number.parseInt(process.env.AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD ?? "85", 10) || 85;
      if (best && best.score >= threshold) {
        historicalLinkByTempId.set(candidate.tempId, { duplicateOfId: best.id, similarityScore: best.score });
      }
    }

    const createdPrimaryIdByTempId = new Map<string, string>();
    const confidenceByTempId = new Map<string, { score: number; band: "HIGH" | "MEDIUM" | "LOW"; reasons: string[] }>();
    let createdCount = 0;
    let createdDuplicateCount = 0;

    for (const candidate of candidates) {
      const assignment = assignmentById.get(candidate.tempId);
      if (!assignment || !assignment.isPrimary || historicalLinkByTempId.has(candidate.tempId)) continue;

      const rawJson: Prisma.JsonObject = {
        title: candidate.event.title,
        startAt: candidate.event.startAt ? candidate.event.startAt.toISOString() : null,
        endAt: candidate.event.endAt ? candidate.event.endAt.toISOString() : null,
        timezone: candidate.event.timezone,
        locationText: candidate.event.locationText,
        description: candidate.event.description,
        sourceUrl: candidate.event.sourceUrl,
      };

      const confidence = computeConfidence(candidate.event, {
        status: "PENDING",
        venueName: venue?.name,
        extractionMethod,
      });
      confidenceByTempId.set(candidate.tempId, confidence);

      const created = await store.ingestExtractedEvent.create({
        data: {
          runId: run.id,
          venueId: params.venueId,
          status: "PENDING",
          fingerprint: candidate.fingerprint,
          similarityKey: candidate.similarityKey,
          clusterKey: assignment.clusterKey,
          sourceUrl: candidate.event.sourceUrl ?? fetched.finalUrl,
          title: candidate.event.title,
          startAt: candidate.event.startAt,
          endAt: candidate.event.endAt,
          timezone: candidate.event.timezone,
          locationText: candidate.event.locationText,
          description: candidate.event.description,
          artistNames: candidate.event.artistNames ?? [],
          imageUrl: resolveRelativeImageUrl(candidate.event.imageUrl, fetched.finalUrl),
          confidenceScore: confidence.score,
          confidenceBand: confidence.band,
          confidenceReasons: sanitizeReasons(confidence.reasons),
          rawJson,
          model: extractedModel,
        },
        select: { id: true },
      });

      createdPrimaryIdByTempId.set(candidate.tempId, created.id);
      createdCount += 1;
    }

    if (process.env.AI_INGEST_IMAGE_PREFETCH_ENABLED === "1") {
      const prefetchTasks = candidates
        .filter((candidate) => {
          const assignment = assignmentById.get(candidate.tempId);
          return Boolean(assignment?.isPrimary) && Boolean(createdPrimaryIdByTempId.get(candidate.tempId)) && Boolean(candidate.event.imageUrl);
        })
        .map(async (candidate) => {
          const candidateId = createdPrimaryIdByTempId.get(candidate.tempId);
          const imageUrl = resolveRelativeImageUrl(candidate.event.imageUrl, fetched.finalUrl);
          if (!candidateId || !imageUrl) return;

          try {
            const safeUrl = await assertSafeUrlImpl(imageUrl);
            const image = await fetchImageWithGuardsImpl(safeUrl.toString());
            const uploaded = await uploadCandidateImageToBlobImpl({
              venueId: params.venueId,
              candidateId,
              sourceUrl: image.finalUrl,
              contentType: image.contentType,
              bytes: image.bytes,
            });

            await store.ingestExtractedEvent.update({
              where: { id: candidateId },
              data: { blobImageUrl: uploaded.url },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn("ingest_image_prefetch_failed", { candidateId, imageUrl, message });
          }
        });

      await Promise.allSettled(prefetchTasks);
    }

    for (const candidate of candidates) {
      const assignment = assignmentById.get(candidate.tempId);
      if (!assignment) continue;

      let duplicateOfId: string | null = null;
      let similarityScore: number | null = null;

      if (historicalLinkByTempId.has(candidate.tempId)) {
        const linked = historicalLinkByTempId.get(candidate.tempId)!;
        duplicateOfId = linked.duplicateOfId;
        similarityScore = linked.similarityScore;
      } else if (!assignment.isPrimary && assignment.duplicateOfId) {
        duplicateOfId = createdPrimaryIdByTempId.get(assignment.duplicateOfId) ?? historicalLinkByTempId.get(assignment.duplicateOfId)?.duplicateOfId ?? null;
        similarityScore = assignment.similarityScore;
      }

      if (!duplicateOfId) continue;

      const inheritedConfidence = assignment?.duplicateOfId ? confidenceByTempId.get(assignment.duplicateOfId) : null;
      const confidence = inheritedConfidence
        ? { ...inheritedConfidence, reasons: sanitizeReasons([...inheritedConfidence.reasons, "duplicate inherited confidence"]) }
        : computeConfidence(candidate.event, {
          status: "DUPLICATE",
          venueName: venue?.name,
          extractionMethod,
        });

      const rawJson: Prisma.JsonObject = {
        title: candidate.event.title,
        startAt: candidate.event.startAt ? candidate.event.startAt.toISOString() : null,
        endAt: candidate.event.endAt ? candidate.event.endAt.toISOString() : null,
        timezone: candidate.event.timezone,
        locationText: candidate.event.locationText,
        description: candidate.event.description,
        sourceUrl: candidate.event.sourceUrl,
      };

      await store.ingestExtractedEvent.create({
        data: {
          runId: run.id,
          venueId: params.venueId,
          status: "DUPLICATE",
          duplicateOfId,
          similarityScore,
          fingerprint: candidate.fingerprint,
          similarityKey: candidate.similarityKey,
          clusterKey: assignment.clusterKey,
          sourceUrl: candidate.event.sourceUrl ?? fetched.finalUrl,
          title: candidate.event.title,
          startAt: candidate.event.startAt,
          endAt: candidate.event.endAt,
          timezone: candidate.event.timezone,
          locationText: candidate.event.locationText,
          description: candidate.event.description,
          artistNames: candidate.event.artistNames ?? [],
          imageUrl: resolveRelativeImageUrl(candidate.event.imageUrl, fetched.finalUrl),
          confidenceScore: confidence.score,
          confidenceBand: confidence.band,
          confidenceReasons: sanitizeReasons(confidence.reasons),
          rawJson,
          model: extractedModel,
        },
      });
      createdDuplicateCount += 1;
    }

    const finishedAt = new Date(now());
    await store.ingestRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAtMs,
        createdCandidates: createdCount,
        createdDuplicates: createdDuplicateCount,
        dedupedCandidates: dedupedCount,
        totalCandidatesReturned,
        extractionMethod,
        model: extractedModel,
        usagePromptTokens: extractedUsage?.promptTokens,
        usageCompletionTokens: extractedUsage?.completionTokens,
        usageTotalTokens: extractedUsage?.totalTokens,
        detectedPlatform,
        venueSnapshot: Object.keys(extractedVenueSnapshot).length > 0
          ? (extractedVenueSnapshot as Prisma.JsonObject)
          : undefined,
        stopReason,
      },
    });

    return { runId: run.id, createdCount, dedupedCount, createdDuplicateCount, stopReason };
  } catch (error) {
    if (error instanceof IngestError) {
      await markRunFailed(store, run.id, startedAtMs, error.code, error.message, error.meta ? JSON.stringify(error.meta) : undefined, detectedPlatform);
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unexpected ingest failure";
    await markRunFailed(store, run.id, startedAtMs, "FETCH_FAILED", message, undefined, detectedPlatform);
    throw error;
  }
}
