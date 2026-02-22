import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { geocodeQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

type MapboxFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
};

type GeoNamesPlace = {
  name?: string;
  adminName1?: string;
  countryName?: string;
  lat?: string | number | null;
  lng?: string | number | null;
};

export function normalizeGeoNames(places: GeoNamesPlace[]) {
  return places
    .map((place) => {
      if (place.lat == null || place.lng == null) return null;
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const labelParts = [place.name, place.adminName1, place.countryName].map((value) => value?.trim()).filter(Boolean);
      return {
        label: labelParts.join(", "),
        lat,
        lng,
      };
    })
    .filter((item): item is { label: string; lat: number; lng: number } => item !== null);
}

export async function GET(req: NextRequest) {
  const parsed = geocodeQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  const user = await getSessionUser().catch(() => null);

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "geocode", user?.id),
      limit: Number(process.env.RATE_LIMIT_GEOCODE_PER_MINUTE ?? 30),
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }

  const q = parsed.data.q;
  const geonamesUser = process.env.GEONAMES_USERNAME;
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!geonamesUser && !mapboxToken) return NextResponse.json({ error: "not_configured" }, { status: 501 });

  try {
    if (geonamesUser) {
      const url = new URL("https://secure.geonames.org/searchJSON");
      url.searchParams.set("q", q);
      url.searchParams.set("featureClass", "P");
      url.searchParams.set("maxRows", "10");
      url.searchParams.set("orderby", "relevance");
      url.searchParams.set("username", geonamesUser);

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return apiError(502, "provider_error", "Geocoding provider request failed");

      const json = (await response.json()) as { geonames?: GeoNamesPlace[] };
      const results = normalizeGeoNames(json.geonames ?? []);
      return NextResponse.json({ results });
    }

    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
    url.searchParams.set("access_token", mapboxToken as string);
    url.searchParams.set("limit", "5");
    url.searchParams.set("autocomplete", "true");

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return apiError(502, "provider_error", "Geocoding provider request failed");

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
      .filter((item): item is { label: string; lat: number; lng: number } => item !== null);

    return NextResponse.json({ results });
  } catch {
    return apiError(502, "provider_error", "Geocoding provider request failed");
  }
}
