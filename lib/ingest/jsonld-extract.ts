import type { NormalizedExtractedEvent } from "@/lib/ingest/schemas";

export type JsonLdExtractionResult = {
  events: NormalizedExtractedEvent[];
  /** True if ld+json blocks were found and parsed, even if zero events were valid */
  attempted: boolean;
};

const EVENT_TYPES = new Set(["Event", "ExhibitionEvent", "VisualArtEvent", "SocialEvent", "MusicEvent", "TheaterEvent"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDateMaybe(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickFirstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstString(item);
      if (picked) return picked;
    }
    return null;
  }

  if (isObject(value) && typeof value.url === "string" && value.url.trim()) {
    return value.url.trim();
  }

  return null;
}

function collectNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => {
      if (!isObject(item) || typeof item.name !== "string") return null;
      const name = item.name.trim();
      return name || null;
    })
    .filter((item): item is string => Boolean(item));
}

function toAbsoluteHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const parsed: unknown[] = [];
  for (const match of html.matchAll(scriptPattern)) {
    const attrs = match[1] ?? "";
    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const typeValue = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? "").trim().toLowerCase();
    if (typeValue !== "application/ld+json") continue;

    const content = (match[2] ?? "").trim();
    if (!content) continue;
    try {
      const value = JSON.parse(content);
      if (Array.isArray(value)) {
        parsed.push(...value);
      } else {
        parsed.push(value);
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return parsed;
}

export function flattenJsonLdGraph(block: unknown): unknown[] {
  if (Array.isArray(block)) {
    return block.flatMap((entry) => flattenJsonLdGraph(entry));
  }

  if (!isObject(block)) return [];

  const graph = block["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap((entry) => flattenJsonLdGraph(entry));
  }

  return [block];
}

export function isJsonLdEvent(value: unknown): boolean {
  if (!isObject(value)) return false;
  const typeValue = value["@type"];
  if (typeof typeValue === "string") return EVENT_TYPES.has(typeValue);
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => typeof item === "string" && EVENT_TYPES.has(item));
  }
  return false;
}

export function mapJsonLdEventToNormalized(raw: unknown, baseUrl: string): NormalizedExtractedEvent | null {
  if (!isObject(raw)) return null;
  void baseUrl;

  const title = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!title) return null;
  if (typeof raw.startDate !== "string" || !raw.startDate.trim()) return null;

  const startAt = parseDateMaybe(raw.startDate);
  const parsedEnd = parseDateMaybe(raw.endDate);
  const endAt = startAt && parsedEnd && parsedEnd >= startAt ? parsedEnd : null;

  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 2000) : "";
  const location = isObject(raw.location) ? raw.location : null;
  const locationText = location?.["@type"] === "Place" && typeof location.name === "string"
    ? location.name.trim() || null
    : null;

  return {
    title,
    startAt,
    endAt,
    timezone: null,
    locationText,
    description: description || null,
    sourceUrl: toAbsoluteHttpUrl(raw.url),
    artistNames: [...collectNames(raw.performer), ...collectNames(raw.organizer)],
    imageUrl: pickFirstString(raw.image),
  };
}

export function extractJsonLdEvents(html: string, baseUrl: string): JsonLdExtractionResult {
  const blocks = extractJsonLdBlocks(html);
  const events = blocks
    .flatMap((block) => flattenJsonLdGraph(block))
    .filter((entry) => isJsonLdEvent(entry))
    .map((event) => mapJsonLdEventToNormalized(event, baseUrl))
    .filter((event): event is NormalizedExtractedEvent => Boolean(event));

  return {
    events,
    attempted: blocks.length > 0,
  };
}

