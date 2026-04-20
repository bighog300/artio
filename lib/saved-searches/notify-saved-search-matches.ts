import { SavedSearchType } from "@prisma/client";
import { db } from "@/lib/db";
import { buildInAppFromTemplate, enqueueNotificationWithDb } from "@/lib/notifications";
import { matchEventToSavedSearch } from "@/lib/saved-searches/match-event";

type SavedSearchNotificationDb = Pick<typeof db, "event" | "savedSearch" | "notificationOutbox" | "notification" | "$transaction">;

export async function notifySavedSearchMatchesWithDb(notificationDb: SavedSearchNotificationDb, eventId: string) {
  const event = await notificationDb.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      startAt: true,
      endAt: true,
      venue: { select: { slug: true, name: true } },
      eventTags: { select: { tag: { select: { slug: true, name: true } } } },
      isPublished: true,
    },
  });

  if (!event?.isPublished) return { notified: 0, checked: 0 };

  const searches = await notificationDb.savedSearch.findMany({
    where: { isEnabled: true, type: { in: [SavedSearchType.NEARBY, SavedSearchType.EVENTS_FILTER] } },
    select: {
      id: true,
      userId: true,
      name: true,
      type: true,
      paramsJson: true,
      user: { select: { email: true, notificationPrefs: { select: { nearbyRecommendationsEnabled: true } } } },
    },
  });

  let notified = 0;
  for (const search of searches) {
    const matches = matchEventToSavedSearch(
      {
        title: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        venue: event.venue,
        tags: event.eventTags.map((item) => item.tag),
      },
      { type: search.type, paramsJson: search.paramsJson },
    );

    if (!matches) continue;

    if (search.type === SavedSearchType.NEARBY && search.user.notificationPrefs?.nearbyRecommendationsEnabled === false) continue;

    const dedupeKey = `saved-search-match:${search.id}:${event.id}`;
    await enqueueNotificationWithDb(notificationDb, {
      type: "SAVED_SEARCH_MATCH",
      toEmail: search.user.email,
      dedupeKey,
      payload: {
        savedSearchId: search.id,
        eventId: event.id,
        searchName: search.name,
        eventTitle: event.title,
        eventSlug: event.slug,
      },
      inApp: buildInAppFromTemplate(search.userId, "SAVED_SEARCH_MATCH", {
        type: "SAVED_SEARCH_MATCH",
        savedSearchId: search.id,
        eventId: event.id,
        searchName: search.name,
        eventTitle: event.title,
        eventSlug: event.slug,
      }),
    });
    notified += 1;
  }

  return { notified, checked: searches.length };
}

export async function notifySavedSearchMatches(eventId: string) {
  return notifySavedSearchMatchesWithDb(db, eventId);
}
