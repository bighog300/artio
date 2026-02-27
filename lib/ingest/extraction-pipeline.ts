import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { IngestError } from "@/lib/ingest/errors";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { extractEventsWithOpenAI } from "@/lib/ingest/openai-extract";
import { parseExtractedEventsFromModel } from "@/lib/ingest/schemas";

const MAX_ERROR_MESSAGE_LENGTH = 500;

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

function truncateMessage(input: string): string {
  return input.length > MAX_ERROR_MESSAGE_LENGTH ? `${input.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : input;
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

async function markRunFailed(store: IngestStore, runId: string, errorCode: string, errorMessage: string) {
  await store.ingestRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorCode,
      errorMessage: truncateMessage(errorMessage),
    },
  });
}

export async function runVenueIngestExtraction(
  params: RunIngestParams,
  deps: {
    store?: IngestStore;
    fetchHtml?: Fetcher;
    extractWithOpenAI?: Extractor;
  } = {},
): Promise<{ runId: string; createdCount: number; dedupedCount: number }> {
  const store = deps.store ?? db;
  const fetchHtml = deps.fetchHtml ?? fetchHtmlWithGuards;
  const extractWithOpenAI = deps.extractWithOpenAI ?? extractEventsWithOpenAI;

  const run = await store.ingestRun.create({
    data: {
      venueId: params.venueId,
      sourceUrl: params.sourceUrl,
      status: "RUNNING",
      startedAt: new Date(),
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
      await markRunFailed(store, run.id, "INGEST_DISABLED", "AI ingest is disabled");
      return { runId: run.id, createdCount: 0, dedupedCount: 0 };
    }

    if (!process.env.OPENAI_API_KEY) {
      await markRunFailed(store, run.id, "MISSING_OPENAI_KEY", "OPENAI_API_KEY is not configured");
      return { runId: run.id, createdCount: 0, dedupedCount: 0 };
    }

    const extracted = await extractWithOpenAI({ html: fetched.html, sourceUrl: fetched.finalUrl, model: params.model });
    const normalized = parseExtractedEventsFromModel(extracted.events);

    let createdCount = 0;
    let dedupedCount = 0;

    for (const event of normalized) {
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

    await store.ingestRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
      },
    });

    return { runId: run.id, createdCount, dedupedCount };
  } catch (error) {
    if (error instanceof IngestError) {
      await markRunFailed(store, run.id, error.code, error.message);
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unexpected ingest failure";
    await markRunFailed(store, run.id, "FETCH_FAILED", message);
    throw error;
  }
}
