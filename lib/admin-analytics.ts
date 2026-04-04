import type { Prisma } from "@prisma/client";

export type AdminAnalyticsDb = {
  engagementEvent: {
    count: (args?: Prisma.EngagementEventCountArgs) => Promise<number>;
    groupBy: (args: Prisma.EngagementEventGroupByArgs) => Promise<Array<{ targetId?: string | null; userId?: string | null; sessionId?: string | null; _count: { _all: number } }>>;
  };
  event: {
    findMany: (args: { where: { id: { in: string[] } }; select: { id: true; title: true; slug: true } }) => Promise<Array<{ id: string; title: string; slug: string }>>;
  };
  venue: {
    findMany: (args: { where: { id: { in: string[] } }; select: { id: true; name: true; slug: true } }) => Promise<Array<{ id: string; name: string; slug: string }>>;
  };
  artist: {
    findMany: (args: { where: { id: { in: string[] } }; select: { id: true; name: true; slug: true } }) => Promise<Array<{ id: string; name: string; slug: string }>>;
  };
  favorite: {
    count: (args?: Prisma.FavoriteCountArgs) => Promise<number>;
    groupBy: (args: Prisma.FavoriteGroupByArgs) => Promise<Array<{ targetId: string; _count: { _all: number } }>>;
  };
  follow: {
    count: (args?: Prisma.FollowCountArgs) => Promise<number>;
  };
  venueSubscription: {
    count: (args?: Prisma.VenueSubscriptionCountArgs) => Promise<number>;
  };
  user: {
    groupBy: (args: Prisma.UserGroupByArgs) => Promise<Array<{ id: string }>>;
  };
};

export type AnalyticsOverview = {
  windowDays: number;
  totals: {
    eventsTracked: number;
    uniqueUsers: number;
    uniqueSessions: number;
    digestsViewed: number;
    digestClicks: number;
    nearbyClicks: number;
    searchClicks: number;
    followingClicks: number;
    follows: number;
    saveSearches: number;
    dau: number;
    savesPerDay: number;
    followsPerDay: number;
    subscriptionRevenueEstimate: number;
  };
  ctr: {
    digestCtr: number | null;
    nearbyCtr: number | null;
    searchCtr: number | null;
    followingCtr: number | null;
  };
  top: {
    events: Array<{ eventId: string; clicks: number; label?: string; href?: string }>;
    venues: Array<{ venueId: string; clicks: number; label?: string; href?: string }>;
    artists: Array<{ artistId: string; clicks: number; label?: string; href?: string }>;
  };
};

const safeCtr = (clicks: number, views: number) => (views > 0 ? clicks / views : null);

export async function getAdminAnalyticsOverview(windowDays: 7 | 30, analyticsDb: AdminAnalyticsDb): Promise<AnalyticsOverview> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rangeWhere = { createdAt: { gte: since } };

  const [
    eventsTracked,
    uniqueUsers,
    uniqueSessions,
    digestsViewed,
    digestClicks,
    nearbyClicks,
    searchClicks,
    followingClicks,
    follows,
    saveSearches,
    nearbyViews,
    searchViews,
    followingViews,
    dau,
    saves,
    followsPerDay,
    activeSubscriptions,
    eventGroups,
    venueGroups,
    artistGroups,
  ] = await Promise.all([
    analyticsDb.engagementEvent.count({ where: rangeWhere }),
    analyticsDb.engagementEvent.groupBy({ by: ["userId"], where: { ...rangeWhere, userId: { not: null } }, _count: { _all: true } }),
    analyticsDb.engagementEvent.groupBy({ by: ["sessionId"], where: { ...rangeWhere, sessionId: { not: null } }, _count: { _all: true } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "VIEW", targetType: "DIGEST_RUN" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "CLICK", targetType: "EVENT", surface: "DIGEST" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "CLICK", targetType: "EVENT", surface: "NEARBY" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "CLICK", targetType: "EVENT", surface: "SEARCH" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "CLICK", targetType: "EVENT", surface: "FOLLOWING" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "FOLLOW", targetType: { in: ["VENUE", "ARTIST"] } } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "SAVE_SEARCH", targetType: "SAVED_SEARCH" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "VIEW", targetType: "EVENT", surface: "NEARBY" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "VIEW", targetType: "EVENT", surface: "SEARCH" } }),
    analyticsDb.engagementEvent.count({ where: { ...rangeWhere, action: "VIEW", targetType: "EVENT", surface: "FOLLOWING" } }),
    analyticsDb.user.groupBy({ by: ["id"], where: { engagementEvents: { some: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } } } }),
    analyticsDb.favorite.count({ where: { targetType: "EVENT", createdAt: { gte: since } } }),
    analyticsDb.follow.count({ where: { createdAt: { gte: since } } }),
    analyticsDb.venueSubscription.count({ where: { status: "ACTIVE" } }),
    analyticsDb.engagementEvent.groupBy({
      by: ["targetId"],
      where: { ...rangeWhere, action: "CLICK", targetType: "EVENT" },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: 10,
    }),
    analyticsDb.engagementEvent.groupBy({
      by: ["targetId"],
      where: { ...rangeWhere, action: "CLICK", targetType: "VENUE" },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: 10,
    }),
    analyticsDb.engagementEvent.groupBy({
      by: ["targetId"],
      where: { ...rangeWhere, action: "CLICK", targetType: "ARTIST" },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: 10,
    }),
  ]);

  const eventIds = eventGroups.filter((item) => typeof item.targetId === "string").map((item) => item.targetId as string);
  const venueIds = venueGroups.filter((item) => typeof item.targetId === "string").map((item) => item.targetId as string);
  const artistIds = artistGroups.filter((item) => typeof item.targetId === "string").map((item) => item.targetId as string);

  const [resolvedEvents, resolvedVenues, resolvedArtists] = await Promise.all([
    eventIds.length ? analyticsDb.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true, slug: true } }) : [],
    venueIds.length ? analyticsDb.venue.findMany({ where: { id: { in: venueIds } }, select: { id: true, name: true, slug: true } }) : [],
    artistIds.length ? analyticsDb.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true, slug: true } }) : [],
  ]);

  const eventMap = new Map(resolvedEvents.map((row) => [row.id, { label: row.title, href: `/events/${row.slug}` }]));
  const venueMap = new Map(resolvedVenues.map((row) => [row.id, { label: row.name, href: `/venues/${row.slug}` }]));
  const artistMap = new Map(resolvedArtists.map((row) => [row.id, { label: row.name, href: `/artists/${row.slug}` }]));

  return {
    windowDays,
    totals: {
      eventsTracked,
      uniqueUsers: uniqueUsers.length,
      uniqueSessions: uniqueSessions.length,
      digestsViewed,
      digestClicks,
      nearbyClicks,
      searchClicks,
      followingClicks,
      follows,
      saveSearches,
      dau: dau.length,
      savesPerDay: Number((saves / windowDays).toFixed(2)),
      followsPerDay: Number((followsPerDay / windowDays).toFixed(2)),
      subscriptionRevenueEstimate: activeSubscriptions * 29,
    },
    ctr: {
      digestCtr: safeCtr(digestClicks, digestsViewed),
      nearbyCtr: safeCtr(nearbyClicks, nearbyViews),
      searchCtr: safeCtr(searchClicks, searchViews),
      followingCtr: safeCtr(followingClicks, followingViews),
    },
    top: {
      events: eventGroups
        .filter((item) => typeof item.targetId === "string")
        .map((item) => ({
          eventId: item.targetId!,
          clicks: item._count._all,
          label: eventMap.get(item.targetId!)?.label,
          href: eventMap.get(item.targetId!)?.href,
        })),
      venues: venueGroups
        .filter((item) => typeof item.targetId === "string")
        .map((item) => ({
          venueId: item.targetId!,
          clicks: item._count._all,
          label: venueMap.get(item.targetId!)?.label,
          href: venueMap.get(item.targetId!)?.href,
        })),
      artists: artistGroups
        .filter((item) => typeof item.targetId === "string")
        .map((item) => ({
          artistId: item.targetId!,
          clicks: item._count._all,
          label: artistMap.get(item.targetId!)?.label,
          href: artistMap.get(item.targetId!)?.href,
        })),
    },
  };
}
