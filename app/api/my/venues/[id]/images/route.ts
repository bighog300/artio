import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleCreateVenueImage } from "@/lib/my-venue-images-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleCreateVenueImage(req, params, {
    requireAuth,
    requireVenueMembership: async (userId, venueId) => {
      const membership = await db.venueMembership.findUnique({ where: { userId_venueId: { userId, venueId } }, select: { id: true } });
      if (!membership) throw new Error("forbidden");
    },
    findMaxSortOrder: async (venueId) => {
      const row = await db.venueImage.findFirst({ where: { venueId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      return row?.sortOrder ?? null;
    },
    findAssetById: async (assetId: string) => db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, url: true, width: true, height: true, mime: true, mimeType: true, sizeBytes: true, byteSize: true },
    }),
    createVenueImage: async (input) => db.venueImage.create({
      data: input,
      select: { id: true, venueId: true, assetId: true, url: true, alt: true, sortOrder: true, createdAt: true },
    }),
  });
}
