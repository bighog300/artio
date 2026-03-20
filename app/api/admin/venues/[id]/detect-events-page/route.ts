import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { detectEventsPageUrl } from "@/lib/ingest/extraction-pipeline";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const venue = await db.venue.findUnique({
      where: { id },
      select: { id: true, websiteUrl: true, eventsPageUrl: true },
    });

    if (!venue) return apiError(404, "not_found", "Venue not found");
    if (!venue.websiteUrl)
      return apiError(
        400,
        "invalid_request",
        "Venue has no websiteUrl to detect from"
      );

    let detectedUrl: string | null = null;
    try {
      const { html } = await fetchHtmlWithGuards(venue.websiteUrl, {
        maxBytes: 1_000_000,
      });
      detectedUrl = detectEventsPageUrl(html, venue.websiteUrl);
    } catch {
      return apiError(
        422,
        "fetch_failed",
        "Could not fetch venue website to detect events page"
      );
    }

    if (!detectedUrl) {
      return NextResponse.json(
        { detected: false, eventsPageUrl: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    await db.venue.update({
      where: { id },
      data: { eventsPageUrl: detectedUrl },
    });

    return NextResponse.json(
      { detected: true, eventsPageUrl: detectedUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
