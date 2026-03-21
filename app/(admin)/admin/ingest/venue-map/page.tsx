import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { VenueMapClient } from "./venue-map-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminIngestVenueMapPage() {
  await requireAdmin();

  const venues = await db.venue.findMany({
    where: {
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
    },
    select: {
      id: true,
      name: true,
      city: true,
      lat: true,
      lng: true,
      websiteUrl: true,
      eventsPageUrl: true,
    },
    orderBy: { name: "asc" },
    take: 500,
  });

  return (
    <VenueMapClient
      venues={venues.map((v) => ({
        id: v.id,
        name: v.name,
        city: v.city,
        lat: v.lat as number,
        lng: v.lng as number,
        websiteUrl: v.websiteUrl,
        eventsPageUrl: v.eventsPageUrl,
      }))}
    />
  );
}
