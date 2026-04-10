import { normalizeGeoNames } from "@/lib/geocode/geonames";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { geocodeQuerySchema } from "@/lib/validators";

export type GeocodeCandidate = { label: string; lat: number; lng: number };

type GeocodeErrorCode = "bad_request" | "not_configured" | "provider_error" | "provider_timeout";

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
    const results = geonamesUser
      ? await (async () => {
          const url = new URL("https://secure.geonames.org/searchJSON");
          url.searchParams.set("q", q);
          url.searchParams.set("featureClass", "P");
          url.searchParams.set("maxRows", "10");
          url.searchParams.set("orderby", "relevance");
          url.searchParams.set("username", geonamesUser);

          const response = await fetchWithTimeout(url, { cache: "no-store" });
          if (!response.ok) throw new GeocodeError("provider_error", "Geocoding provider request failed");

          const json = (await response.json()) as Parameters<typeof normalizeGeoNames>[0];
          return normalizeGeoNames(json).results;
        })()
      : await (async () => {
          const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
          url.searchParams.set("access_token", mapboxToken as string);
          url.searchParams.set("limit", "5");
          url.searchParams.set("autocomplete", "true");

          const response = await fetchWithTimeout(url, { cache: "no-store" });
          if (!response.ok) throw new GeocodeError("provider_error", "Geocoding provider request failed");

          const data = (await response.json()) as {
            features?: Array<{ place_name?: string; center?: [number, number] }>;
          };

          return (data.features ?? [])
            .map((feature) => {
              const [lng, lat] = feature.center ?? [];
              if (typeof lat !== "number" || typeof lng !== "number") return null;
              return {
                label: feature.place_name ?? q,
                lat,
                lng,
              };
            })
            .filter((candidate): candidate is GeocodeCandidate => Boolean(candidate));
        })();

    const limit = opts?.limit;
    return typeof limit === "number" ? results.slice(0, Math.max(0, limit)) : results;
  } catch (error) {
    if (error instanceof GeocodeError) throw error;
    if (error instanceof FetchTimeoutError) throw new GeocodeError("provider_timeout", "Geocoding provider request timed out");
    throw new GeocodeError("provider_error", "Geocoding provider request failed");
  }
}
