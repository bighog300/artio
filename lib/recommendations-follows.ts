import { db } from "@/lib/db";

const CANDIDATE_LIMIT = 200;

export type FollowSuggestion = {
  id: string;
  slug: string;
  name: string;
  followersCount: number;
  reason: string;
};

export type FollowRecommendationsResponse = {
  artists: FollowSuggestion[];
  venues: FollowSuggestion[];
};

export function excludeAlreadyFollowedIds(candidateIds: string[], followedIds: Set<string>) {
  return candidateIds.filter((id) => !followedIds.has(id));
}

function clampLimit(limit: number) {
  return Math.max(1, Math.min(24, Math.floor(limit || 12)));
}

async function getFollowerCounts(targetType: "ARTIST" | "VENUE", ids: string[]) {
  if (!ids.length) return new Map<string, number>();

  const rows = await db.follow.groupBy({
    by: ["targetId"],
    where: { targetType, targetId: { in: ids } },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 0);
  for (const row of rows) counts.set(row.targetId, row._count._all);
  return counts;
}

function mapWithOrder<T extends { id: string }>(orderedIds: string[], rows: T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.map((id) => byId.get(id)).filter((row): row is T => Boolean(row));
}

export async function getFollowRecommendations(args: { userId?: string | null; limit?: number }): Promise<FollowRecommendationsResponse> {
  const now = new Date();
  const limit = clampLimit(args.limit ?? 12);

  if (!args.userId) {
    return getPublicRecommendations({ now, limit });
  }

  const follows = await db.follow.findMany({
    where: { userId: args.userId },
    select: { targetType: true, targetId: true },
  });

  const followedVenueIds = new Set(follows.filter((follow) => follow.targetType === "VENUE").map((follow) => follow.targetId));
  const followedArtistIds = new Set(follows.filter((follow) => follow.targetType === "ARTIST").map((follow) => follow.targetId));

  const artistCandidates = followedVenueIds.size
    ? await db.eventArtist.groupBy({
      by: ["artistId"],
      where: {
        event: {
          isPublished: true,
          startAt: { gte: now },
          venueId: { in: [...followedVenueIds] },
        },
        artist: { isPublished: true },
      },
      _count: { _all: true },
      orderBy: { _count: { artistId: "desc" } },
      take: CANDIDATE_LIMIT,
    })
    : [];

  const venueCandidates = followedArtistIds.size
    ? await db.event.groupBy({
      by: ["venueId"],
      where: {
        isPublished: true,
        startAt: { gte: now },
        venueId: { not: null },
        venue: { isPublished: true },
        eventArtists: { some: { artistId: { in: [...followedArtistIds] } } },
      },
      _count: { _all: true },
      orderBy: { _count: { venueId: "desc" } },
      take: CANDIDATE_LIMIT,
    })
    : [];

  const artistIds = excludeAlreadyFollowedIds(artistCandidates.map((row) => row.artistId), followedArtistIds).slice(0, CANDIDATE_LIMIT);
  const venueIds = excludeAlreadyFollowedIds(
    venueCandidates.map((row) => row.venueId).filter((venueId): venueId is string => Boolean(venueId)),
    followedVenueIds,
  ).slice(0, CANDIDATE_LIMIT);

  const [artists, venues, artistFollowerCounts, venueFollowerCounts] = await Promise.all([
    artistIds.length
      ? db.artist.findMany({
        where: { id: { in: artistIds }, isPublished: true },
        select: { id: true, slug: true, name: true },
        take: limit,
      })
      : Promise.resolve([]),
    venueIds.length
      ? db.venue.findMany({
        where: { id: { in: venueIds }, isPublished: true },
        select: { id: true, slug: true, name: true },
        take: limit,
      })
      : Promise.resolve([]),
    getFollowerCounts("ARTIST", artistIds),
    getFollowerCounts("VENUE", venueIds),
  ]);

  const orderedArtists = mapWithOrder(artistIds, artists).slice(0, limit).map((artist) => ({
    id: artist.id,
    slug: artist.slug,
    name: artist.name,
    followersCount: artistFollowerCounts.get(artist.id) ?? 0,
    reason: "Artists performing at venues you follow",
  }));

  const orderedVenues = mapWithOrder(venueIds, venues).slice(0, limit).map((venue) => ({
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    followersCount: venueFollowerCounts.get(venue.id) ?? 0,
    reason: "Venues hosting artists you follow",
  }));

  return {
    artists: orderedArtists,
    venues: orderedVenues,
  };
}

async function getPublicRecommendations(args: { now: Date; limit: number }): Promise<FollowRecommendationsResponse> {
  const [artistFollowerRows, venueFollowerRows] = await Promise.all([
    db.follow.groupBy({
      by: ["targetId"],
      where: { targetType: "ARTIST" },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: CANDIDATE_LIMIT,
    }),
    db.follow.groupBy({
      by: ["targetId"],
      where: { targetType: "VENUE" },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: CANDIDATE_LIMIT,
    }),
  ]);

  const artistIds = artistFollowerRows.map((row) => row.targetId);
  const venueIds = venueFollowerRows.map((row) => row.targetId);

  const [artists, venues, artistEventRows, venueEventRows] = await Promise.all([
    artistIds.length
      ? db.artist.findMany({ where: { id: { in: artistIds }, isPublished: true }, select: { id: true, slug: true, name: true } })
      : Promise.resolve([]),
    venueIds.length
      ? db.venue.findMany({ where: { id: { in: venueIds }, isPublished: true }, select: { id: true, slug: true, name: true } })
      : Promise.resolve([]),
    artistIds.length
      ? db.eventArtist.groupBy({
        by: ["artistId"],
        where: { artistId: { in: artistIds }, event: { isPublished: true, startAt: { gte: args.now } } },
        _count: { _all: true },
      })
      : Promise.resolve([]),
    venueIds.length
      ? db.event.groupBy({
        by: ["venueId"],
        where: { isPublished: true, startAt: { gte: args.now }, venueId: { in: venueIds } },
        _count: { _all: true },
      })
      : Promise.resolve([]),
  ]);

  const artistFollowers = new Map(artistFollowerRows.map((row) => [row.targetId, row._count._all]));
  const venueFollowers = new Map(venueFollowerRows.map((row) => [row.targetId, row._count._all]));
  const artistUpcoming = new Map(artistEventRows.map((row) => [row.artistId, row._count._all]));
  const venueUpcoming = new Map(venueEventRows.filter((row) => row.venueId).map((row) => [row.venueId as string, row._count._all]));

  const rankedArtists = artists
    .map((artist) => ({
      ...artist,
      followersCount: artistFollowers.get(artist.id) ?? 0,
      upcomingCount: artistUpcoming.get(artist.id) ?? 0,
    }))
    .sort((a, b) => b.followersCount - a.followersCount || b.upcomingCount - a.upcomingCount || a.name.localeCompare(b.name))
    .slice(0, args.limit)
    .map((artist) => ({ ...artist, reason: "Trending artists this week" }));

  const rankedVenues = venues
    .map((venue) => ({
      ...venue,
      followersCount: venueFollowers.get(venue.id) ?? 0,
      upcomingCount: venueUpcoming.get(venue.id) ?? 0,
    }))
    .sort((a, b) => b.followersCount - a.followersCount || b.upcomingCount - a.upcomingCount || a.name.localeCompare(b.name))
    .slice(0, args.limit)
    .map((venue) => ({ ...venue, reason: "Trending venues this week" }));

  return {
    artists: rankedArtists.map((artist) => ({
      id: artist.id,
      slug: artist.slug,
      name: artist.name,
      followersCount: artist.followersCount,
      reason: artist.reason,
    })),
    venues: rankedVenues.map((venue) => ({
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      followersCount: venue.followersCount,
      reason: venue.reason,
    })),
  };
}
