import type { FollowTargetType, PrismaClient } from "@prisma/client";
import { publishedEventWhere } from "@/lib/publish-status";

export type FollowManageItem = {
  id: string;
  name: string;
  slug: string;
  followersCount: number;
  upcomingEventsCount: number;
};

export function sortFollowManageItems(items: FollowManageItem[]) {
  return items.slice().sort((a, b) => (
    b.upcomingEventsCount - a.upcomingEventsCount
    || b.followersCount - a.followersCount
    || a.name.localeCompare(b.name)
  ));
}

export async function getFollowManageData(db: PrismaClient, userId: string) {
  const follows = await db.follow.findMany({ where: { userId }, select: { targetType: true, targetId: true } });
  const artistIds = follows.filter((follow) => follow.targetType === "ARTIST").map((follow) => follow.targetId);
  const venueIds = follows.filter((follow) => follow.targetType === "VENUE").map((follow) => follow.targetId);

  const now = new Date();
  const in30d = new Date(now);
  in30d.setDate(in30d.getDate() + 30);

  const [artists, venues, artistFollowerCounts, venueFollowerCounts, venueUpcomingCounts, artistUpcomingCounts] = await Promise.all([
    artistIds.length ? db.artist.findMany({ where: { id: { in: artistIds }, deletedAt: null }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    venueIds.length ? db.venue.findMany({ where: { id: { in: venueIds }, deletedAt: null }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    artistIds.length
      ? db.follow.groupBy({ by: ["targetId"], where: { targetType: "ARTIST", targetId: { in: artistIds } }, _count: { _all: true } })
      : Promise.resolve([]),
    venueIds.length
      ? db.follow.groupBy({ by: ["targetId"], where: { targetType: "VENUE", targetId: { in: venueIds } }, _count: { _all: true } })
      : Promise.resolve([]),
    venueIds.length
      ? db.event.groupBy({
        by: ["venueId"],
        where: { venueId: { in: venueIds }, ...publishedEventWhere(), startAt: { gte: now, lte: in30d } },
        _count: { _all: true },
      })
      : Promise.resolve([]),
    artistIds.length
      ? db.eventArtist.groupBy({
        by: ["artistId"],
        where: {
          artistId: { in: artistIds },
          event: { ...publishedEventWhere(), startAt: { gte: now, lte: in30d } },
        },
        _count: { _all: true },
      })
      : Promise.resolve([]),
  ]);

  const mapCounts = <T extends { _count: { _all: number } }>(
    rows: T[],
    getId: (row: T) => string | null,
  ) => new Map(rows.map((row) => [getId(row), row._count._all] as const).filter((entry): entry is [string, number] => Boolean(entry[0])));

  const artistFollowerMap = mapCounts(artistFollowerCounts, (row) => row.targetId);
  const venueFollowerMap = mapCounts(venueFollowerCounts, (row) => row.targetId);
  const artistUpcomingMap = mapCounts(artistUpcomingCounts, (row) => row.artistId);
  const venueUpcomingMap = mapCounts(venueUpcomingCounts, (row) => row.venueId);

  return {
    artists: sortFollowManageItems(artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      followersCount: artistFollowerMap.get(artist.id) ?? 0,
      upcomingEventsCount: artistUpcomingMap.get(artist.id) ?? 0,
    }))),
    venues: sortFollowManageItems(venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      followersCount: venueFollowerMap.get(venue.id) ?? 0,
      upcomingEventsCount: venueUpcomingMap.get(venue.id) ?? 0,
    }))),
  };
}

export function normalizeBulkDeleteTargets(targets: Array<{ targetType: FollowTargetType; targetId: string }>) {
  return targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId }));
}


export async function getFollowManageDataSafe(load: () => Promise<{ artists: FollowManageItem[]; venues: FollowManageItem[] }>) {
  try {
    return await load();
  } catch {
    return { artists: [], venues: [] };
  }
}
