export const INGESTION_JOB_TYPES = [
  "crawl-gallery",
  "crawl-page",
  "extract-page",
  "enrich-artist",
  "enrich-artwork",
  "directory-page",
  "entity-page",
] as const;

export type IngestionJobType = (typeof INGESTION_JOB_TYPES)[number];

export type IngestionJobPayloadMap = {
  "crawl-gallery": { gallerySourceId: string; force?: boolean };
  "crawl-page": { galleryPageId: string; gallerySourceId: string };
  "extract-page": { galleryPageId: string; gallerySourceId: string; pageUrl: string; html?: string };
  "enrich-artist": { artistCandidateId: string };
  "enrich-artwork": { artworkCandidateId: string };
  "directory-page": { directorySourceId: string; letter: string; page: number; url: string };
  "entity-page": { directorySourceId: string; entityUrl: string; entityTypeHint?: string | null };
};

export type IngestionJob<T extends IngestionJobType = IngestionJobType> = {
  id: string;
  type: T;
  payload: IngestionJobPayloadMap[T];
  attempts: number;
  maxAttempts: number;
  runAt: number;
  idempotencyKey: string;
  createdAt: number;
};

export type QueueEnqueueOptions = {
  idempotencyKey?: string;
  maxAttempts?: number;
  initialDelayMs?: number;
};
