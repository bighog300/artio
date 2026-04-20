import type { PrismaClient } from "@prisma/client";
import { getEffectiveNotificationPreferences, isWithinQuietHours } from "@/lib/notification-preferences";

export async function syncFollowEventNotifications(db: PrismaClient, userId: string) {
  const prefs = await getEffectiveNotificationPreferences(userId);
  if (!prefs.followedCreatorUpdatesEnabled) return;
  if (isWithinQuietHours(new Date(), prefs)) return;

  const follows = await db.follow.findMany({ where: { userId }, select: { targetType: true, targetId: true } });
  if (!follows.length) return;

  const followedVenueIds = follows.filter((f) => f.targetType === "VENUE").map((f) => f.targetId);
  const followedArtistIds = follows.filter((f) => f.targetType === "ARTIST").map((f) => f.targetId);

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);
  const events = await db.event.findMany({
    where: {
      isPublished: true,
      publishedAt: { gte: since },
      OR: [
        followedVenueIds.length ? { venueId: { in: followedVenueIds } } : undefined,
        followedArtistIds.length ? { eventArtists: { some: { artistId: { in: followedArtistIds } } } } : undefined,
      ].filter(Boolean) as any,
    },
    select: { id: true, slug: true, title: true, venueId: true, venue: { select: { name: true } }, eventArtists: { select: { artistId: true }, take: 5 } },
    take: 100,
    orderBy: { publishedAt: "desc" },
  });

  if (!events.length) return;

  await db.$transaction(events.flatMap((event) => {
    const byVenue = Boolean(event.venueId && followedVenueIds.includes(event.venueId));
    const byArtist = event.eventArtists.some((row) => followedArtistIds.includes(row.artistId));
    const type = byVenue ? "FOLLOWED_VENUE_NEW_EVENT" : byArtist ? "FOLLOWED_ARTIST_NEW_EVENT" : null;
    if (!type) return [];
    const dedupeKey = `followed-event:${type}:${userId}:${event.id}`;
    return [db.userNotification.upsert({
      where: { userId_type_entityId: { userId, type, entityId: event.id } },
      update: {},
      create: { userId, type, entityId: event.id },
    }), db.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        userId,
        type: "EVENT_CHANGE_NOTIFY",
        title: byVenue ? `New event at ${event.venue?.name ?? "a followed venue"}` : "New event from a followed artist",
        body: event.title,
        href: `/events/${event.slug}`,
        dedupeKey,
        entityType: "EVENT",
        entityId: event.id,
      },
    })];
  }));
}
