import { normalizeGeoNames } from "@/lib/geocode/geonames";
import { geocodeQuerySchema } from "@/lib/validators";

export type GeocodeCandidate = { label: string; lat: number; lng: number };

type MapboxFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
};

type GeocodeErrorCode = "bad_request" | "not_configured" | "provider_error";

export class GeocodeError extends Error {
  code: GeocodeErrorCode;

  constructor(code: GeocodeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function geocodeCandidates(query: string, opts?: { limit?: number }): Promise<GeocodeCandidate[]> {
  const parsed = geocodeQuerySchema.safeParse({ q: query });
  if (!parsed.success) throw new GeocodeError("bad_request", "Invalid query parameters");

  const q = parsed.data.q;
  const geonamesUser = process.env.GEONAMES_USERNAME;
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!geonamesUser && !mapboxToken) throw new GeocodeError("not_configured", "Geocoding provider is not configured");

  try {
    if (geonamesUser) {
      const url = new URL("https://secure.geonames.org/searchJSON");
      url.searchParams.set("q", q);
      url.searchParams.set("featureClass", "P");
      url.searchParams.set("maxRows", "10");
      url.searchParams.set("orderby", "relevance");
      url.searchParams.set("username", geonamesUser);

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new GeocodeError("provider_error", "Geocoding provider request failed");

      const json = (await response.json()) as Parameters<typeof normalizeGeoNames>[0];
      const { results } = normalizeGeoNames(json);
      const limit = opts?.limit;
      return typeof limit === "number" ? results.slice(0, Math.max(0, limit)) : results;
    }

    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
    url.searchParams.set("access_token", mapboxToken as string);
    url.searchParams.set("limit", "5");
    url.searchParams.set("autocomplete", "true");

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new GeocodeError("provider_error", "Geocoding provider request failed");

    const json = (await response.json()) as { features?: MapboxFeature[] };
    const results = (json.features ?? [])
      .slice(0, 5)
      .map((feature) => {
        const [lng, lat] = feature.center ?? [];
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        return {
          label: feature.place_name ?? feature.text ?? q,
          lat,
          lng,
        };
      })
      .filter((item): item is GeocodeCandidate => item !== null);

    const limit = opts?.limit;
    return typeof limit === "number" ? results.slice(0, Math.max(0, limit)) : results;
  } catch (error) {
    if (error instanceof GeocodeError) throw error;
    throw new GeocodeError("provider_error", "Geocoding provider request failed");
  }
}

export async function geocodeBest(query: string): Promise<GeocodeCandidate | null> {
  const results = await geocodeCandidates(query, { limit: 1 });
  return results[0] ?? null;
}
