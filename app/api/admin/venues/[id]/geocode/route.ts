import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { geocodeVenueAddressToLatLng, MapboxForwardGeocodeError } from "@/lib/geocode/mapbox-forward";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { formatVenueAddress, isVenueAddressGeocodeable, normalizeCountryCode } from "@/lib/venues/format-venue-address";
import { computeReadiness } from "@/lib/publish-blockers";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type GeocodeDeps = {
  requireAdminUser: typeof requireAdmin;
  appDb: typeof db;
  geocodeAddress: typeof geocodeVenueAddressToLatLng;
};

function getMissingAddressFields(venue: { city: string | null; postcode: string | null; country: string | null }) {
  const missing: string[] = [];
  if (!venue.country?.trim()) missing.push("country");
  if (!venue.city?.trim() && !venue.postcode?.trim()) missing.push("city or postcode");
  return missing;
}

function withPublishState(row: { status: string; country: string | null; lat: number | null; lng: number | null; name: string | null; city: string | null }) {
  return {
    status: row.status,
    publishBlockers: computeReadiness(row).blockers,
  };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminVenueGeocode(params, {
    requireAdminUser: requireAdmin,
    appDb: db,
    geocodeAddress: geocodeVenueAddressToLatLng,
  });
}

export async function handleAdminVenueGeocode(params: Promise<{ id: string }>, deps: GeocodeDeps) {
  try {
    await deps.requireAdminUser();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const venue = await deps.appDb.venue.findUnique({
      where: { id: parsedId.data.id },
      select: { id: true, name: true, status: true, addressLine1: true, addressLine2: true, city: true, region: true, postcode: true, country: true, lat: true, lng: true },
    });
    if (!venue) return NextResponse.json({ ok: false, message: "Venue not found" }, { status: 404, headers: NO_STORE_HEADERS });

    if (!isVenueAddressGeocodeable(venue)) {
      const missingFields = getMissingAddressFields(venue);
      const missingSuffix = missingFields.length > 0 ? ` Add: ${missingFields.join(", ")}.` : "";
      return NextResponse.json({ ok: false, message: `Address is incomplete for geocoding.${missingSuffix}`, item: withPublishState(venue) }, { headers: NO_STORE_HEADERS });
    }

    const addressText = formatVenueAddress(venue);
    if (!addressText) {
      return NextResponse.json({ ok: false, message: "Address is incomplete for geocoding. Add: country, city or postcode.", item: withPublishState(venue) }, { headers: NO_STORE_HEADERS });
    }

    const result = await deps.geocodeAddress({
      addressText,
      countryCode: normalizeCountryCode(venue.country),
    });

    if (!result) {
      return NextResponse.json({ ok: false, message: "No geocoding match found. Try editing the address, postcode, or country and retry.", item: withPublishState(venue) }, { headers: NO_STORE_HEADERS });
    }

    const updated = await deps.appDb.venue.update({ where: { id: venue.id }, data: { lat: result.lat, lng: result.lng } });

    return NextResponse.json({ ok: true, lat: result.lat, lng: result.lng, item: withPublishState(updated) }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof MapboxForwardGeocodeError && error.code === "provider_timeout") {
      return NextResponse.json({ ok: false, message: "Geocoding provider timed out. Please retry in a moment." }, { headers: NO_STORE_HEADERS });
    }
    if (error instanceof MapboxForwardGeocodeError && error.code === "not_configured") {
      return NextResponse.json({ ok: false, message: "Geocoding provider is not configured. Please retry after provider setup." }, { headers: NO_STORE_HEADERS });
    }
    if (error instanceof MapboxForwardGeocodeError) {
      return NextResponse.json({ ok: false, message: "Geocoding provider failed (rate limit/network). Please retry." }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: false, message: "Unexpected server error" }, { headers: NO_STORE_HEADERS });
  }
}
