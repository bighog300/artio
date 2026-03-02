import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { geocodeVenueAddressToLatLng, MapboxForwardGeocodeError } from "@/lib/geocode/mapbox-forward";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { formatVenueAddress, isVenueAddressGeocodeable, normalizeCountryCode } from "@/lib/venues/format-venue-address";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const venue = await db.venue.findUnique({
      where: { id: parsedId.data.id },
      select: { id: true, addressLine1: true, addressLine2: true, city: true, region: true, postcode: true, country: true },
    });
    if (!venue) return NextResponse.json({ ok: false, message: "Venue not found" }, { status: 404, headers: NO_STORE_HEADERS });

    if (!isVenueAddressGeocodeable(venue)) {
      return NextResponse.json({ ok: false, message: "Address is incomplete for geocoding" }, { headers: NO_STORE_HEADERS });
    }

    const addressText = formatVenueAddress(venue);
    if (!addressText) {
      return NextResponse.json({ ok: false, message: "Address is incomplete for geocoding" }, { headers: NO_STORE_HEADERS });
    }

    const result = await geocodeVenueAddressToLatLng({
      addressText,
      countryCode: normalizeCountryCode(venue.country),
    });

    if (!result) {
      return NextResponse.json({ ok: false, message: "No geocoding result found" }, { headers: NO_STORE_HEADERS });
    }

    await db.venue.update({ where: { id: venue.id }, data: { lat: result.lat, lng: result.lng } });

    return NextResponse.json({ ok: true, lat: result.lat, lng: result.lng }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof MapboxForwardGeocodeError && error.code === "provider_timeout") {
      return NextResponse.json({ ok: false, message: "Geocoding provider request timed out" }, { headers: NO_STORE_HEADERS });
    }
    if (error instanceof MapboxForwardGeocodeError && error.code === "not_configured") {
      return NextResponse.json({ ok: false, message: "Geocoding provider is not configured" }, { headers: NO_STORE_HEADERS });
    }
    if (error instanceof MapboxForwardGeocodeError) {
      return NextResponse.json({ ok: false, message: "Geocoding provider request failed" }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: false, message: "Unexpected server error" }, { headers: NO_STORE_HEADERS });
  }
}
