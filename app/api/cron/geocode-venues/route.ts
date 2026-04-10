import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { forwardGeocodeVenueAddressToLatLng, ForwardGeocodeError } from "@/lib/geocode/forward";
import { buildVenueGeocodeQueries, isVenueAddressGeocodeable } from "@/lib/venues/format-venue-address";
import { shouldDryRun } from "@/lib/cron-runtime";

type SampleOutcome = "updated" | "noMatch" | "failed" | "wouldUpdate";

type Sample = {
  venueId: string;
  query: string;
  outcome: SampleOutcome;
  result?: { lat: number; lng: number };
};

export const runtime = "nodejs";

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(parsed, 100);
}

function isNotConfiguredError(error: unknown) {
  if (error instanceof ForwardGeocodeError) return error.code === "not_configured";
  if (typeof error === "string") return error === "not_configured";
  if (error && typeof error === "object") {
    const withMessage = error as { message?: unknown; code?: unknown };
    return withMessage.message === "not_configured" || withMessage.code === "not_configured";
  }
  return false;
}

export async function GET(req: NextRequest) {
  const authFailure = validateCronRequest(extractCronSecret(req.headers), {
    route: "/api/cron/geocode-venues",
    method: req.method,
  });
  if (authFailure) return authFailure;

  const searchParams = new URL(req.url).searchParams;
  const limit = parseLimit(searchParams.get("limit"));
  const dryRun = shouldDryRun(searchParams.get("dryRun"));

  const venues = await db.venue.findMany({
    where: {
      OR: [{ lat: null }, { lng: null }],
      AND: [
        {
          OR: [{ postcode: { not: null } }, { city: { not: null } }, { addressLine1: { not: null } }],
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postcode: true,
      country: true,
      lat: true,
      lng: true,
    },
  });

  let processed = 0;
  let updated = 0;
  let wouldUpdate = 0;
  let noMatch = 0;
  let failed = 0;
  let skipped = 0;
  const samples: Sample[] = [];

  for (const venue of venues) {
    processed += 1;
    if (!isVenueAddressGeocodeable(venue)) {
      skipped += 1;
      continue;
    }

    try {
      const queries = buildVenueGeocodeQueries(venue);
      const query = queries[0] ?? "";
      let matchedQuery = query;
      let result: { lat: number; lng: number } | null = null;

      for (const addressText of queries) {
        try {
          result = await forwardGeocodeVenueAddressToLatLng({ addressText });
          if (result) {
            matchedQuery = addressText;
            break;
          }
        } catch (error) {
          if (isNotConfiguredError(error)) throw error;
          // try next query
        }
      }

      if (!result) {
        noMatch += 1;
        if (samples.length < 5) samples.push({ venueId: venue.id, query: matchedQuery, outcome: "noMatch" });
        continue;
      }

      if (dryRun) {
        wouldUpdate += 1;
        if (samples.length < 5) samples.push({ venueId: venue.id, query: matchedQuery, outcome: "wouldUpdate", result });
        continue;
      }

      await db.venue.update({ where: { id: venue.id }, data: { lat: result.lat, lng: result.lng } });
      updated += 1;
      if (samples.length < 5) samples.push({ venueId: venue.id, query: matchedQuery, outcome: "updated", result });
    } catch (error) {
      if (isNotConfiguredError(error)) {
        return NextResponse.json({ error: "not_configured" }, { status: 501 });
      }
      failed += 1;
      console.warn(`cron_geocode_venues_failed venueId=${venue.id} city=${venue.city ?? ""} postcode=${venue.postcode ?? ""}`);
      if (samples.length < 5) samples.push({ venueId: venue.id, query: venue.name ?? "", outcome: "failed" });
    }
  }

  console.log(`cron_geocode_venues_summary processed=${processed} updated=${updated} wouldUpdate=${wouldUpdate} noMatch=${noMatch} failed=${failed} skipped=${skipped}`);

  return NextResponse.json({
    ok: true,
    processed,
    updated,
    wouldUpdate,
    noMatch,
    failed,
    skipped,
    samples,
  });
}
