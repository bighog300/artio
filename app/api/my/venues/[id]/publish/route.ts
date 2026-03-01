import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { requireVenueRole } from "@/lib/auth";
import { venueIdParamSchema, zodDetails } from "@/lib/validators";
import { apiError } from "@/lib/api";
import { handleVenueSelfPublish } from "@/lib/my-venue-self-publish-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = venueIdParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  return handleVenueSelfPublish(req, { venueId: parsedId.data.id, isPublished: true }, {
    requireVenueRole: (venueId) => requireVenueRole(venueId, "EDITOR"),
    findVenueForPublish: (venueId) => db.venue.findUnique({
      where: { id: venueId },
      select: { id: true, slug: true, name: true, description: true, featuredAssetId: true, city: true, country: true, lat: true, lng: true, websiteUrl: true, deletedAt: true, isPublished: true, status: true },
    }),
    updateVenuePublishState: (venueId, isPublished) => db.venue.update({ where: { id: venueId }, data: { isPublished, status: isPublished ? "PUBLISHED" : "DRAFT", deletedAt: null, deletedByAdminId: null, deletedReason: null }, select: { id: true, slug: true, name: true, description: true, featuredAssetId: true, city: true, country: true, lat: true, lng: true, websiteUrl: true, deletedAt: true, isPublished: true, status: true } }),
    logAdminAction,
  });
}
