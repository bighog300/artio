import { Prisma } from "@prisma/client";

type RankingDb = {
  engagementEvent: {
    findMany: (args: Prisma.EngagementEventFindManyArgs) => Promise<Array<{ targetId: string }>>;
  };
  event: {
    findMany: (args: Prisma.EventFindManyArgs) => Promise<Array<{ id: string; venueId: string | null; eventArtists: Array<{ artistId: string }>; eventTags: Array<{ tag: { slug: string } }> }>>;
  };
};

type CandidateEvent = {
  id: string;
  startAt: Date;
  venueId: string | null;
  eventArtists: Array<{ artistId: string }>;
  eventTags: Array<{ tag: { slug: string } }>;
};

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function computeEngagementBoosts(db: RankingDb, userId: string, candidates: CandidateEvent[]) {
  if (!candidates.length) return new Map<string, number>();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const clicks = await db.engagementEvent.findMany({
    where: { userId, action: "CLICK", targetType: "EVENT", createdAt: { gte: since } },
    select: { targetId: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  const clickedIds = Array.from(new Set(clicks.map((item) => item.targetId)));
  if (!clickedIds.length) return new Map<string, number>();

  const clickedEvents = await db.event.findMany({
    where: { id: { in: clickedIds } },
    select: { id: true, venueId: true, eventArtists: { select: { artistId: true } }, eventTags: { include: { tag: { select: { slug: true } } } } },
  });

  const clickedVenues = new Set(clickedEvents.map((event) => event.venueId).filter((value): value is string => Boolean(value)));
  const clickedArtists = new Set(clickedEvents.flatMap((event) => event.eventArtists.map((artist) => artist.artistId)));
  const clickedTags = new Set(clickedEvents.flatMap((event) => event.eventTags.map((tag) => tag.tag.slug)));

  const boosts = new Map<string, number>();
  for (const candidate of candidates) {
    let boost = 0;
    if (candidate.venueId && clickedVenues.has(candidate.venueId)) boost += 2;
    if (candidate.eventArtists.some((artist) => clickedArtists.has(artist.artistId))) boost += 2;
    if (candidate.eventTags.some((tag) => clickedTags.has(tag.tag.slug))) boost += 1;
    if (boost > 0) boosts.set(candidate.id, boost);
  }
  return boosts;
}

export function applyConservativeRanking<T extends CandidateEvent>(events: T[], boosts: Map<string, number>) {
  const grouped = new Map<string, T[]>();
  for (const event of events) {
    const key = dayKey(event.startAt);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  const dayOrder = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  const ranked: T[] = [];
  for (const key of dayOrder) {
    const bucket = grouped.get(key)!;
    bucket.sort((a, b) => {
      const boostDiff = (boosts.get(b.id) ?? 0) - (boosts.get(a.id) ?? 0);
      if (boostDiff !== 0) return boostDiff;
      const startDiff = a.startAt.getTime() - b.startAt.getTime();
      if (startDiff !== 0) return startDiff;
      return a.id.localeCompare(b.id);
    });
    ranked.push(...bucket);
  }
  return ranked;
}
