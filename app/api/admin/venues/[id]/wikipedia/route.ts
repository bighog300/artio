import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupVenueOnWikipedia } from "@/lib/venue-generation/wikipedia-enrichment";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const venue = await db.venue.findUnique({
      where: { id },
      select: { id: true, name: true, city: true, description: true },
    });
    if (!venue) return apiError(404, "not_found", "Venue not found");

    const wiki = await lookupVenueOnWikipedia({
      name: venue.name,
      city: venue.city,
    });

    if (!wiki.found) {
      return NextResponse.json(
        { found: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        found: true,
        pageId: wiki.pageId,
        pageTitle: wiki.pageTitle,
        pageUrl: wiki.pageUrl,
        description: wiki.description,
        imageUrl: wiki.imageUrl,
        hasExistingDescription: Boolean(venue.description),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Admin role required");
    console.error("admin_venues_id_wikipedia_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const body = await req.json().catch(() => ({})) as {
      applyDescription?: boolean;
      applyImage?: boolean;
      pageId?: string;
      pageUrl?: string;
      description?: string;
      imageUrl?: string;
    };

    const venue = await db.venue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!venue) return apiError(404, "not_found", "Venue not found");

    const patch: {
      description?: string;
      wikipediaPageId?: string;
      wikipediaUrl?: string;
    } = {};

    if (body.pageId) patch.wikipediaPageId = body.pageId;
    if (body.pageUrl) patch.wikipediaUrl = body.pageUrl;
    if (body.applyDescription && body.description) {
      patch.description = body.description;
    }

    if (Object.keys(patch).length > 0) {
      await db.venue.update({ where: { id }, data: patch });
    }

    if (body.applyImage && body.imageUrl) {
      const existing = await db.venueHomepageImageCandidate.findFirst({
        where: { venueId: id, url: body.imageUrl },
        select: { id: true },
      });
      if (!existing) {
        await db.venueHomepageImageCandidate.updateMany({
          where: { venueId: id },
          data: { sortOrder: { increment: 1 } },
        });
        await db.venueHomepageImageCandidate.create({
          data: {
            venueId: id,
            runItemId: null,
            url: body.imageUrl,
            source: "wikipedia",
            sortOrder: 0,
            status: "pending",
          },
        });
      }
    }

    return NextResponse.json(
      { applied: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Admin role required");
    console.error("admin_venues_id_wikipedia_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
