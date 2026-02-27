import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { IngestError } from "@/lib/ingest/errors";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { extractEventsWithOpenAI } from "@/lib/ingest/openai-extract";
import { parseExtractedEventsFromModel } from "@/lib/ingest/schemas";

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_ERROR_DETAIL_LENGTH = 1000;
const DEFAULT_MAX_CANDIDATES_PER_RUN = 25;

const CANDIDATE_CAP_STOP_REASON = "CANDIDATE_CAP_REACHED";

type RunIngestParams = {
  venueId: string;
  sourceUrl: string;
  model?: string;
};

type Extractor = typeof extractEventsWithOpenAI;
type Fetcher = typeof fetchHtmlWithGuards;

type IngestStore = {
  ingestRun: {
    create: typeof db.ingestRun.create;
    update: typeof db.ingestRun.update;
  };
  ingestExtractedEvent: {
    findUnique: typeof db.ingestExtractedEvent.findUnique;
    create: typeof db.ingestExtractedEvent.create;
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
  const signature = [
    params.venueId,
    normalizeText(params.title),
    dayStamp(params.startAt),
    normalizeText(params.locationText),
  ].join("|");

  return createHash("sha256").update(signature).digest("hex");
}

function getMaxCandidatesPerVenueRun() {
  const parsed = Number.parseInt(process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_CANDIDATES_PER_RUN;
}

async function markRunFailed(
  store: IngestStore,
  runId: string,
  startedAtMs: number,
  errorCode: string,
  errorMessage: string,
  errorDetail?: unknown,
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
    },
  });
}

export async function runVenueIngestExtraction(
  params: RunIngestParams,
  deps: {
    store?: IngestStore;
    fetchHtml?: Fetcher;
    extractWithOpenAI?: Extractor;
    now?: () => number;
  } = {},
): Promise<{ runId: string; createdCount: number; dedupedCount: number }> {
  const store = deps.store ?? db;
  const fetchHtml = deps.fetchHtml ?? fetchHtmlWithGuards;
  const extractWithOpenAI = deps.extractWithOpenAI ?? extractEventsWithOpenAI;
  const now = deps.now ?? Date.now;
  const startedAtMs = now();

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

    if (process.env.AI_INGEST_ENABLED !== "1") {
      await markRunFailed(store, run.id, startedAtMs, "INGEST_DISABLED", "AI ingest is disabled");
      return { runId: run.id, createdCount: 0, dedupedCount: 0 };
    }

    if (!process.env.OPENAI_API_KEY) {
      await markRunFailed(store, run.id, startedAtMs, "MISSING_OPENAI_KEY", "OPENAI_API_KEY is not configured");
      return { runId: run.id, createdCount: 0, dedupedCount: 0 };
    }

    const extracted = await extractWithOpenAI({ html: fetched.html, sourceUrl: fetched.finalUrl, model: params.model });
    const normalized = parseExtractedEventsFromModel(extracted.events);
    const totalCandidatesReturned = normalized.length;
    const maxCandidates = getMaxCandidatesPerVenueRun();
    const cappedCandidates = normalized.slice(0, maxCandidates);
    const stopReason = totalCandidatesReturned > maxCandidates ? CANDIDATE_CAP_STOP_REASON : null;

    let createdCount = 0;
    let dedupedCount = 0;

    for (const event of cappedCandidates) {
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

      const rawJson: Prisma.JsonObject = {
        title: event.title,
        startAt: event.startAt ? event.startAt.toISOString() : null,
        endAt: event.endAt ? event.endAt.toISOString() : null,
        timezone: event.timezone,
        locationText: event.locationText,
        description: event.description,
        sourceUrl: event.sourceUrl,
      };

      await store.ingestExtractedEvent.create({
        data: {
          runId: run.id,
          venueId: params.venueId,
          status: "PENDING",
          fingerprint,
          sourceUrl: event.sourceUrl ?? fetched.finalUrl,
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          timezone: event.timezone,
          locationText: event.locationText,
          description: event.description,
          rawJson,
          model: extracted.model,
        },
      });
      createdCount += 1;
    }

    const finishedAt = new Date(now());
    await store.ingestRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAtMs,
        createdCandidates: createdCount,
        dedupedCandidates: dedupedCount,
        totalCandidatesReturned,
        model: extracted.model,
        usagePromptTokens: extracted.usage?.promptTokens,
        usageCompletionTokens: extracted.usage?.completionTokens,
        usageTotalTokens: extracted.usage?.totalTokens,
        stopReason,
      },
    });

    return { runId: run.id, createdCount, dedupedCount };
  } catch (error) {
    if (error instanceof IngestError) {
      await markRunFailed(store, run.id, startedAtMs, error.code, error.message, error.meta ? JSON.stringify(error.meta) : undefined);
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unexpected ingest failure";
    await markRunFailed(store, run.id, startedAtMs, "FETCH_FAILED", message);
    throw error;
  }
}
