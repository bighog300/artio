import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityPatch } from "@/lib/admin-venues-route";
import { geocodeForVenueCreate } from "@/lib/venues/venue-geocode-flow";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const venue = await db.venue.findUnique({ where: { id } });
  if (venue && venue.lat == null && venue.lng == null) {
    try {
      const coords = await geocodeForVenueCreate(venue);
      if (coords.lat != null && coords.lng != null) {
        await db.venue.update({ where: { id }, data: { lat: coords.lat, lng: coords.lng } });
      }
    } catch {
      // Best-effort — proceed to publish attempt, blockers will surface if still missing
    }
  }

  const publishRequest = new NextRequest(req.url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  return handleAdminEntityPatch(publishRequest, { id }, { requireAdminUser: requireAdmin, appDb: db });
}
