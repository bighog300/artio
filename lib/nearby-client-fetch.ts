export type NearbyFetchFilters = {
  sort: string;
  q?: string;
  tags: string[];
  from?: string;
  to?: string;
  days: number;
};

export type NearbyFetchInput = {
  lat: string | number;
  lng: string | number;
  radiusKm: string | number;
  cursor?: string | null;
  limit?: number;
  filters: NearbyFetchFilters;
};

export function normalizeNearbyNumber(value: string | number): number {
  return typeof value === "string" ? Number(value) : value;
}

export function buildNearbyEventsQuery(input: NearbyFetchInput): URLSearchParams | null {
  const latNum = normalizeNearbyNumber(input.lat);
  const lngNum = normalizeNearbyNumber(input.lng);
  const radiusNum = normalizeNearbyNumber(input.radiusKm);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || !Number.isFinite(radiusNum) || radiusNum <= 0) return null;

  const query = new URLSearchParams({
    lat: latNum.toFixed(6),
    lng: lngNum.toFixed(6),
    radiusKm: String(radiusNum),
    limit: String(input.limit ?? 24),
    sort: input.filters.sort,
  });

  if (input.filters.q) query.set("q", input.filters.q);
  if (input.filters.tags.length) query.set("tags", input.filters.tags.join(","));
  if (input.filters.from || input.filters.to) {
    if (input.filters.from) query.set("from", input.filters.from);
    if (input.filters.to) query.set("to", input.filters.to);
  } else {
    query.set("days", String(input.filters.days));
  }
  if (input.cursor) query.set("cursor", input.cursor);
  return query;
}

export async function fetchNearbyEvents<T>(
  input: NearbyFetchInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const query = buildNearbyEventsQuery(input);
  if (!query) return { ok: false, error: "Choose a location and radius to search nearby" };

  const response = await fetchImpl(`/api/events/nearby?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    let errorMessage = "Unable to load nearby events.";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (response.status === 400 && (body.error === "invalid_request" || body.message)) {
        errorMessage = body.message ?? "Unable to load nearby events.";
      }
    } catch {
      // ignore JSON parse issues
    }
    return { ok: false, error: errorMessage };
  }

  return { ok: true, data: (await response.json()) as T };
}
