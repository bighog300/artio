import { Prisma, type SavedSearchType } from "@prisma/client";
import { resolveImageUrl } from "@/lib/assets";
import { getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { runSavedSearchEvents } from "@/lib/saved-searches";

const MAX_CANDIDATES = 400;
const SOURCE_CAPS = { follows: 200, saved: 100, nearby: 100, affinity: 150 } as const;
const TAG_CATEGORY_WEIGHTS: Record<string, number> = {
  medium: 4,
  genre: 3,
  movement: 3,
  mood: 1,
};

function tagCategoryWeight(category: string | null | undefined): number {
  return TAG_CATEGORY_WEIGHTS[category ?? ""] ?? 1;
}

type CandidateEvent = {
  id: string;
  title: string;
  slug: string;
  startAt: Date;
  lat: number | null;
  lng: number | null;
  venueId: string | null;
  venue: { name: string; slug: string; city: string | null; lat: number | null; lng: number | null } | null;
  images: Array<{ url: string; asset: { url: string } | null }>;
  eventArtists: Array<{ artistId: string }>;
  eventTags: Array<{ tagId: string; tag: { slug: string; category: string } }>;
  feedbackMetaJson?: Prisma.JsonValue | null;
};

export type EventListItem = {
  id: string;
  title: string;
  slug: string;
  startAt: string;
  venue: { name: string; slug: string; city: string | null } | null;
  primaryImageUrl: string | null | undefined;
};

export type ForYouItem = { event: EventListItem; score: number; reasons: string[] };

function addIds(candidates: string[], seen: Set<string>, incoming: string[], cap: number) {
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push(id);
    if (candidates.length >= cap) break;
  }
}

function freshnessPoints(now: Date, startAt: Date) {
  const ms = startAt.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days <= 1) return 4;
  if (days <= 3) return 3;
  if (days <= 7) return 2;
  return 1;
}

function freshnessReason(now: Date, startAt: Date) {
  const ms = startAt.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days <= 1) return "Happening in the next 24 hours";
  if (days <= 3) return "Happening in the next few days";
  if (days <= 7) return "Coming up this week";
  return "Upcoming soon";
}


function feedbackFromMeta(metaJson: Prisma.JsonValue | null | undefined) {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) return null;
  const feedback = (metaJson as Record<string, Prisma.JsonValue>).feedback;
  return feedback === "up" || feedback === "down" ? feedback : null;
}

export function scoreForYouEvents(args: {
  now: Date;
  events: CandidateEvent[];
  followedVenueIds: Set<string>;
  followedArtistIds: Set<string>;
  savedSearchMatches: Map<string, string[]>;
  nearbyMatches: Set<string>;
  affinityVenueIds: Set<string>;
  affinityArtistIds: Set<string>;
  affinityTagIds: Set<string>;
  likedVenueIds: Set<string>;
  likedArtistIds: Set<string>;
  likedTagIds: Set<string>;
  dislikedVenueIds: Set<string>;
  dislikedArtistIds: Set<string>;
  dislikedTagIds: Set<string>;
  locationLabel?: string | null;
  radiusKm?: number;
}) {
  const scored = args.events.map((event) => {
    let score = 0;
    const reasons: string[] = [];

    if (event.venueId && args.followedVenueIds.has(event.venueId)) {
      score += 10;
      reasons.push("From a venue you follow");
    }
    if (event.eventArtists.some((artist) => args.followedArtistIds.has(artist.artistId))) {
      score += 10;
      reasons.push("Includes an artist you follow");
    }

    const searchMatches = args.savedSearchMatches.get(event.id) ?? [];
    if (searchMatches.length) {
      score += Math.min(12, searchMatches.length * 6);
      reasons.push(`Matches your saved search '${searchMatches[0]}'`);
    }

    if (args.nearbyMatches.has(event.id)) {
      score += 6;
      reasons.push(`Near ${args.locationLabel || "your area"} (within ${args.radiusKm ?? 25} km)`);
    }

    if (event.venueId && args.affinityVenueIds.has(event.venueId)) {
      score += 5;
      reasons.push("Similar to venues you clicked recently");
    }
    if (event.eventArtists.some((artist) => args.affinityArtistIds.has(artist.artistId))) {
      score += 5;
      reasons.push("Similar to artists you clicked recently");
    }
    const affinityTagScore = event.eventTags.reduce((total, tag) => (
      args.affinityTagIds.has(tag.tagId) ? total + tagCategoryWeight(tag.tag.category) : total
    ), 0);
    if (affinityTagScore > 0) {
      score += affinityTagScore;
      reasons.push("Has tags you engage with");
    }

    const likedSimilarity = Boolean(
      (event.venueId && args.likedVenueIds.has(event.venueId))
      || event.eventArtists.some((artist) => args.likedArtistIds.has(artist.artistId))
      || event.eventTags.some((tag) => args.likedTagIds.has(tag.tagId)),
    );
    if (likedSimilarity) {
      score += 2;
      reasons.push("Because you liked similar events");
    }

    if (event.venueId && args.dislikedVenueIds.has(event.venueId)) score -= 4;
    if (event.eventArtists.some((artist) => args.dislikedArtistIds.has(artist.artistId))) score -= 4;
    if (event.eventTags.some((tag) => args.dislikedTagIds.has(tag.tagId))) score -= 4;

    const feedback = feedbackFromMeta(event.feedbackMetaJson);
    if (feedback === "up") score += 8;
    if (feedback === "down") score = -999;

    score += freshnessPoints(args.now, event.startAt);

    if (reasons.length === 0) reasons.push(freshnessReason(args.now, event.startAt));

    return { event, rawScore: score, score, reasons: reasons.slice(0, 3) };
  });

  scored.sort((a, b) => b.rawScore - a.rawScore || a.event.startAt.getTime() - b.event.startAt.getTime() || a.event.id.localeCompare(b.event.id));

  const venueCounts = new Map<string, number>();
  for (const item of scored) {
    if (!item.event.venueId) continue;
    const seen = (venueCounts.get(item.event.venueId) ?? 0) + 1;
    venueCounts.set(item.event.venueId, seen);
    if (seen >= 3) item.score -= 3;
  }

  scored.sort((a, b) => b.score - a.score || a.event.startAt.getTime() - b.event.startAt.getTime() || a.event.id.localeCompare(b.event.id));
  return scored.filter((item) => item.score >= 0);
}

export async function getForYouRecommendations(db: Prisma.TransactionClient | Prisma.DefaultPrismaClient, args: { userId: string; days: 7 | 30; limit: number }) {
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() + args.days);

  const [user, follows, searches] = await Promise.all([
    db.user.findUnique({ where: { id: args.userId }, select: { locationLat: true, locationLng: true, locationRadiusKm: true, locationLabel: true } }),
    db.follow.findMany({ where: { userId: args.userId }, select: { targetType: true, targetId: true } }),
    db.savedSearch.findMany({ where: { userId: args.userId, isEnabled: true, frequency: "WEEKLY" }, orderBy: { updatedAt: "desc" }, take: 2, select: { id: true, name: true, type: true, paramsJson: true } }),
  ]);

  const followedVenueIds = new Set(follows.filter((f) => f.targetType === "VENUE").map((f) => f.targetId));
  const followedArtistIds = new Set(follows.filter((f) => f.targetType === "ARTIST").map((f) => f.targetId));
  const hiddenEventIds = new Set((await db.engagementEvent.findMany({
    where: { userId: args.userId, action: "HIDE", targetType: "EVENT" },
    select: { targetId: true },
    distinct: ["targetId"],
  })).map((item) => item.targetId));
  const hiddenIds = Array.from(hiddenEventIds);

  const candidateIds: string[] = [];
  const seenIds = new Set<string>();

  if (followedVenueIds.size || followedArtistIds.size) {
    const items = await db.event.findMany({
      where: {
        isPublished: true,
        startAt: { gte: now, lte: to },
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
        OR: [
          followedVenueIds.size ? { venueId: { in: Array.from(followedVenueIds) } } : undefined,
          followedArtistIds.size ? { eventArtists: { some: { artistId: { in: Array.from(followedArtistIds) } } } } : undefined,
        ].filter(Boolean) as Prisma.EventWhereInput[],
      },
      select: { id: true },
      take: SOURCE_CAPS.follows,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });
    addIds(candidateIds, seenIds, items.map((item) => item.id), SOURCE_CAPS.follows);
  }

  const savedSearchMatches = new Map<string, string[]>();
  for (const search of searches) {
    let items: Array<{ id: string; startAt: Date }> = [];
    try {
      items = await runSavedSearchEvents({ eventDb: db as never, type: search.type as SavedSearchType, paramsJson: search.paramsJson, limit: 50, hiddenEventIds: hiddenIds });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn("recommendations.for_you.saved_search_skipped", {
        userId: args.userId,
        searchId: search.id,
        searchType: search.type,
        error: err.message,
      });
      continue;
    }
    const filtered = items.filter((item) => item.startAt >= now && item.startAt <= to).slice(0, 50);
    for (const item of filtered) {
      const matches = savedSearchMatches.get(item.id) ?? [];
      matches.push(search.name);
      savedSearchMatches.set(item.id, matches.slice(0, 2));
    }
    addIds(candidateIds, seenIds, filtered.map((item) => item.id), SOURCE_CAPS.follows + SOURCE_CAPS.saved);
  }

  const nearbyMatches = new Set<string>();
  if (user?.locationLat != null && user.locationLng != null) {
    const box = getBoundingBox(user.locationLat, user.locationLng, user.locationRadiusKm);
    const nearby = await db.event.findMany({
      where: {
        isPublished: true,
        startAt: { gte: now, lte: to },
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
        OR: [
          { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
          { venue: { is: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } } } },
        ],
      },
      select: { id: true, lat: true, lng: true, venue: { select: { lat: true, lng: true } } },
      take: SOURCE_CAPS.nearby,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });
    for (const event of nearby) {
      const sourceLat = event.lat ?? event.venue?.lat;
      const sourceLng = event.lng ?? event.venue?.lng;
      if (sourceLat == null || sourceLng == null) continue;
      if (isWithinRadiusKm(user.locationLat, user.locationLng, sourceLat, sourceLng, user.locationRadiusKm)) nearbyMatches.add(event.id);
    }
    addIds(candidateIds, seenIds, Array.from(nearbyMatches), SOURCE_CAPS.follows + SOURCE_CAPS.saved + SOURCE_CAPS.nearby);
  }

  const since = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const clicks = await db.engagementEvent.findMany({
    where: { userId: args.userId, action: "CLICK", targetType: "EVENT", createdAt: { gte: since } },
    select: { targetId: true, metaJson: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  const likedEventIds = new Set<string>();
  const dislikedEventIds = new Set<string>();
  const clickedEventIds = new Set<string>();
  for (const click of clicks) {
    const feedback = feedbackFromMeta(click.metaJson);
    if (feedback === "up") likedEventIds.add(click.targetId);
    if (feedback === "down") dislikedEventIds.add(click.targetId);
    if (feedback !== "down") clickedEventIds.add(click.targetId);
  }

  let affinityVenueIds = new Set<string>();
  let affinityArtistIds = new Set<string>();
  let affinityTagIds = new Set<string>();
  let likedVenueIds = new Set<string>();
  let likedArtistIds = new Set<string>();
  let likedTagIds = new Set<string>();
  let dislikedVenueIds = new Set<string>();
  let dislikedArtistIds = new Set<string>();
  let dislikedTagIds = new Set<string>();
  if (clickedEventIds.size || likedEventIds.size || dislikedEventIds.size) {
    const idsToLoad = Array.from(new Set([...clickedEventIds, ...likedEventIds, ...dislikedEventIds]));
    const clickedEvents = await db.event.findMany({
      where: { id: { in: idsToLoad } },
      select: { id: true, venueId: true, eventArtists: { select: { artistId: true } }, eventTags: { select: { tagId: true, tag: { select: { category: true } } } } },
    });

    const top = (counts: Map<string, number>) => new Set(Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([id]) => id));
    const venueCounts = new Map<string, number>();
    const artistCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const likedVenueCounts = new Map<string, number>();
    const likedArtistCounts = new Map<string, number>();
    const likedTagCounts = new Map<string, number>();
    const dislikedVenueCounts = new Map<string, number>();
    const dislikedArtistCounts = new Map<string, number>();
    const dislikedTagCounts = new Map<string, number>();
    for (const event of clickedEvents) {
      if (clickedEventIds.has(event.id) && event.venueId) venueCounts.set(event.venueId, (venueCounts.get(event.venueId) ?? 0) + 1);
      if (clickedEventIds.has(event.id)) {
        for (const artist of event.eventArtists) artistCounts.set(artist.artistId, (artistCounts.get(artist.artistId) ?? 0) + 1);
        for (const tag of event.eventTags) tagCounts.set(tag.tagId, (tagCounts.get(tag.tagId) ?? 0) + 1);
      }
      if (likedEventIds.has(event.id)) {
        if (event.venueId) likedVenueCounts.set(event.venueId, (likedVenueCounts.get(event.venueId) ?? 0) + 1);
        for (const artist of event.eventArtists) likedArtistCounts.set(artist.artistId, (likedArtistCounts.get(artist.artistId) ?? 0) + 1);
        for (const tag of event.eventTags) likedTagCounts.set(tag.tagId, (likedTagCounts.get(tag.tagId) ?? 0) + 1);
      }
      if (dislikedEventIds.has(event.id)) {
        if (event.venueId) dislikedVenueCounts.set(event.venueId, (dislikedVenueCounts.get(event.venueId) ?? 0) + 1);
        for (const artist of event.eventArtists) dislikedArtistCounts.set(artist.artistId, (dislikedArtistCounts.get(artist.artistId) ?? 0) + 1);
        for (const tag of event.eventTags) dislikedTagCounts.set(tag.tagId, (dislikedTagCounts.get(tag.tagId) ?? 0) + 1);
      }
    }
    affinityVenueIds = top(venueCounts);
    affinityArtistIds = top(artistCounts);
    affinityTagIds = top(tagCounts);
    likedVenueIds = top(likedVenueCounts);
    likedArtistIds = top(likedArtistCounts);
    likedTagIds = top(likedTagCounts);
    dislikedVenueIds = top(dislikedVenueCounts);
    dislikedArtistIds = top(dislikedArtistCounts);
    dislikedTagIds = top(dislikedTagCounts);

    if (affinityVenueIds.size || affinityArtistIds.size || affinityTagIds.size) {
      const affinity = await db.event.findMany({
        where: {
          isPublished: true,
          startAt: { gte: now, lte: to },
          ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
          OR: [
            affinityVenueIds.size ? { venueId: { in: Array.from(affinityVenueIds) } } : undefined,
            affinityArtistIds.size ? { eventArtists: { some: { artistId: { in: Array.from(affinityArtistIds) } } } } : undefined,
            affinityTagIds.size ? { eventTags: { some: { tagId: { in: Array.from(affinityTagIds) } } } } : undefined,
          ].filter(Boolean) as Prisma.EventWhereInput[],
        },
        select: { id: true },
        take: SOURCE_CAPS.affinity,
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
      });
      addIds(candidateIds, seenIds, affinity.map((item) => item.id), SOURCE_CAPS.follows + SOURCE_CAPS.saved + SOURCE_CAPS.nearby + SOURCE_CAPS.affinity);
    }
  }

  const trimmed = candidateIds.filter((id) => !dislikedEventIds.has(id) && !hiddenEventIds.has(id)).slice(0, MAX_CANDIDATES);
  const events = await db.event.findMany({
    where: { id: { in: trimmed }, isPublished: true, startAt: { gte: now, lte: to } },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      lat: true,
      lng: true,
      venueId: true,
      venue: { select: { name: true, slug: true, city: true, lat: true, lng: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true, asset: { select: { url: true } } } },
      eventArtists: { select: { artistId: true } },
      eventTags: { select: { tagId: true, tag: { select: { slug: true, category: true } } } },
    },
  });

  const candidateFeedbackEvents = await db.engagementEvent.findMany({
    where: {
      userId: args.userId,
      action: "CLICK",
      targetType: "EVENT",
      targetId: { in: events.map((event) => event.id) },
    },
    select: { targetId: true, metaJson: true, createdAt: true },
    orderBy: [{ targetId: "asc" }, { createdAt: "desc" }],
  });

  const feedbackMetaByEventId = new Map<string, Prisma.JsonValue | null>();
  for (const feedbackEvent of candidateFeedbackEvents) {
    if (feedbackMetaByEventId.has(feedbackEvent.targetId)) continue;
    feedbackMetaByEventId.set(feedbackEvent.targetId, feedbackEvent.metaJson);
  }

  const eventsWithFeedback = events.map((event) => ({
    ...event,
    feedbackMetaJson: feedbackMetaByEventId.get(event.id) ?? null,
  }));

  const scored = scoreForYouEvents({
    now,
    events: eventsWithFeedback,
    followedVenueIds,
    followedArtistIds,
    savedSearchMatches,
    nearbyMatches,
    affinityVenueIds,
    affinityArtistIds,
    affinityTagIds,
    likedVenueIds,
    likedArtistIds,
    likedTagIds,
    dislikedVenueIds,
    dislikedArtistIds,
    dislikedTagIds,
    locationLabel: user?.locationLabel,
    radiusKm: user?.locationRadiusKm,
  });

  const items: ForYouItem[] = scored.slice(0, args.limit).map((item) => ({
    score: item.score,
    reasons: item.reasons,
    event: {
      id: item.event.id,
      title: item.event.title,
      slug: item.event.slug,
      startAt: item.event.startAt.toISOString(),
      venue: item.event.venue ? { name: item.event.venue.name, slug: item.event.venue.slug, city: item.event.venue.city } : null,
      primaryImageUrl: resolveImageUrl(item.event.images[0]?.asset?.url, item.event.images[0]?.url),
    },
  }));

  return { windowDays: args.days, items, candidateCount: trimmed.length };
}
