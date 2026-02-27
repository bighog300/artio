import { z } from "zod";
import { IngestError } from "@/lib/ingest/errors";

const extractedEventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  timezone: z.string().trim().min(1).nullable().optional(),
  locationText: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().min(1).nullable().optional(),
  sourceUrl: z.string().trim().url().nullable().optional(),
});

const extractedEventArraySchema = z.array(extractedEventSchema);

export type NormalizedExtractedEvent = {
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
  locationText: string | null;
  description: string | null;
  sourceUrl: string | null;
};

function parseDateMaybe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseExtractedEventsFromModel(raw: unknown): NormalizedExtractedEvent[] {
  const parsed = extractedEventArraySchema.safeParse(raw);
  if (!parsed.success) {
    throw new IngestError("BAD_MODEL_OUTPUT", "Model output did not match expected schema", {
      issues: parsed.error.issues,
    });
  }

  return parsed.data.map((item) => ({
    title: item.title.trim(),
    startAt: parseDateMaybe(item.startAt),
    endAt: parseDateMaybe(item.endAt),
    timezone: item.timezone ?? null,
    locationText: item.locationText ?? null,
    description: item.description ?? null,
    sourceUrl: item.sourceUrl ?? null,
  }));
}
