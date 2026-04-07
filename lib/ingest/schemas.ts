import { z } from "zod";
import { IngestError } from "@/lib/ingest/errors";

export type VenueSnapshot = {
  venueDescription?: string | null;
  venueCoverImageUrl?: string | null;
  venueOpeningHours?: string | null;
  venueContactEmail?: string | null;
  venueInstagramUrl?: string | null;
  venueFacebookUrl?: string | null;
};

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events", "venueDescription", "venueCoverImageUrl", "venueOpeningHours", "venueContactEmail", "venueInstagramUrl", "venueFacebookUrl"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "startAt", "endAt", "timezone", "locationText", "description", "sourceUrl", "artistNames", "imageUrl"],
        properties: {
          title: { type: "string", minLength: 1 },
          startAt: { anyOf: [{ type: "string" }, { type: "null" }] },
          endAt: { anyOf: [{ type: "string" }, { type: "null" }] },
          timezone: { anyOf: [{ type: "string" }, { type: "null" }] },
          locationText: { anyOf: [{ type: "string" }, { type: "null" }] },
          description: { anyOf: [{ type: "string" }, { type: "null" }] },
          sourceUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
          artistNames: { type: "array", items: { type: "string" } },
          imageUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
    venueDescription: { anyOf: [{ type: "string" }, { type: "null" }] },
    venueCoverImageUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    venueOpeningHours: { anyOf: [{ type: "string" }, { type: "null" }] },
    venueContactEmail: { anyOf: [{ type: "string" }, { type: "null" }] },
    venueInstagramUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    venueFacebookUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

const extractedEventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  timezone: z.string().trim().min(1).nullable().optional(),
  locationText: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().min(1).nullable().optional(),
  sourceUrl: z.string().trim().url().nullable().optional(),
  artistNames: z.array(z.string().trim().min(1)).optional().default([]),
  imageUrl: z.string().trim().min(1).nullable().optional(),
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
  artistNames: string[];
  imageUrl: string | null;
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
    artistNames: item.artistNames ?? [],
    imageUrl: item.imageUrl ?? null,
  }));
}
