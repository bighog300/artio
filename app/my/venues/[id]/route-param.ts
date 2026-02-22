import type { PrismaClient } from "@prisma/client";

export const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

type VenueFinder = Pick<PrismaClient, "venue">;

export async function resolveVenueIdFromRouteParam(id: string, db: VenueFinder) {
  if (isUuid(id)) return { venueId: id, redirected: false as const };

  const venue = await db.venue.findUnique({ where: { slug: id }, select: { id: true } });
  if (!venue) return null;

  return { venueId: venue.id, redirected: true as const };
}
