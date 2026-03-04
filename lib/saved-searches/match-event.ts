import { SavedSearchType } from "@prisma/client";
import { normalizeSavedSearchParams } from "@/lib/saved-searches";

type MatchableEvent = {
  title?: string | null;
  description?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  venue?: { slug?: string | null; name?: string | null } | null;
  tags?: Array<{ slug?: string | null; name?: string | null }>;
};

type MatchableSavedSearch = {
  type: SavedSearchType;
  paramsJson: unknown;
};

type NearbyParams = ReturnType<typeof normalizeSavedSearchParams> & {
  q?: string | null;
  tags?: string[];
  from?: string | null;
  to?: string | null;
  days?: number;
};

type EventsFilterParams = ReturnType<typeof normalizeSavedSearchParams> & {
  q?: string | null;
  tags?: string[];
  from?: string | null;
  to?: string | null;
  venue?: string | null;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tokenize(value: string) {
  return value.toLowerCase().split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

function keywordMatches(query: string, text: string) {
  const tokens = tokenize(query);
  if (!tokens.length) return true;
  const haystack = text.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function dateRangeOverlaps(eventStartAt: Date | null, eventEndAt: Date | null, from: string | null | undefined, to: string | null | undefined) {
  if (!eventStartAt) return false;
  const eventStart = eventStartAt.getTime();
  const eventEnd = (eventEndAt ?? eventStartAt).getTime();

  const fromDate = from ? toDate(from) : null;
  const toDateValue = to ? toDate(to) : null;
  if (from && !fromDate) return false;
  if (to && !toDateValue) return false;

  const searchStart = fromDate?.getTime() ?? Number.NEGATIVE_INFINITY;
  const searchEnd = toDateValue?.getTime() ?? Number.POSITIVE_INFINITY;

  return eventStart <= searchEnd && eventEnd >= searchStart;
}

export function matchEventToSavedSearch(event: MatchableEvent, search: MatchableSavedSearch) {
  if (search.type === "ARTWORK") return false;

  const eventStartAt = toDate(event.startAt);
  const eventEndAt = toDate(event.endAt);
  const title = event.title?.trim() ?? "";
  const description = event.description?.trim() ?? "";
  const text = `${title}\n${description}`.trim();
  const tags = new Set((event.tags ?? []).flatMap((tag) => [tag.slug?.toLowerCase(), tag.name?.toLowerCase()]).filter((value): value is string => Boolean(value)));

  if (search.type === "NEARBY") {
    const normalized = normalizeSavedSearchParams("NEARBY", search.paramsJson) as NearbyParams;
    if (normalized.q && (!text || !keywordMatches(normalized.q, text))) return false;
    if (normalized.tags && normalized.tags.length > 0 && !normalized.tags.every((tag) => tags.has(tag.toLowerCase()))) return false;

    const from = normalized.from;
    const to = normalized.to ?? (() => {
      if (normalized.days == null || !eventStartAt) return null;
      const start = from ? toDate(from) : new Date();
      if (!start) return null;
      const windowEnd = new Date(start);
      windowEnd.setDate(windowEnd.getDate() + normalized.days);
      return windowEnd.toISOString();
    })();

    return dateRangeOverlaps(eventStartAt, eventEndAt, from, to);
  }

  const normalized = normalizeSavedSearchParams("EVENTS_FILTER", search.paramsJson) as EventsFilterParams;
  if (normalized.q && (!text || !keywordMatches(normalized.q, text))) return false;
  if (normalized.tags && normalized.tags.length > 0 && !normalized.tags.every((tag) => tags.has(tag.toLowerCase()))) return false;
  if (normalized.venue) {
    const venueSlug = event.venue?.slug?.toLowerCase();
    if (!venueSlug || venueSlug !== normalized.venue.toLowerCase()) return false;
  }

  if (normalized.from || normalized.to) {
    return dateRangeOverlaps(eventStartAt, eventEndAt, normalized.from, normalized.to);
  }

  return true;
}
