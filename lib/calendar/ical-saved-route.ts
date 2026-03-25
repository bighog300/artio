import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardUser } from "@/lib/auth-guard";
import { getDetailUrl } from "@/lib/seo.public-profiles";
import { buildVCalendar, buildVEvent } from "@/lib/ical/build";

function venueLocation(name?: string | null, address?: string | null) {
  return [name?.trim(), address?.trim()].filter(Boolean).join(", ");
}

type IcalSavedDeps = {
  getUser: typeof guardUser;
  findFavorites: typeof db.favorite.findMany;
  findEvents: typeof db.event.findMany;
};

export async function handleIcalSavedGet(
  deps: IcalSavedDeps = {
    getUser: guardUser,
    findFavorites: db.favorite.findMany.bind(db.favorite),
    findEvents: db.event.findMany.bind(db.event),
  },
) {
  const user = await deps.getUser();
  if (user instanceof NextResponse) return user;

  const favorites = await deps.findFavorites({
    where: { userId: user.id, targetType: "EVENT" },
    select: { targetId: true },
  });

  const eventIds = favorites.map((favorite) => favorite.targetId);
  if (eventIds.length === 0) {
    const emptyCalendar = buildVCalendar([]);
    return new NextResponse(emptyCalendar, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'attachment; filename="my-events.ics"',
        "cache-control": "private, no-store",
      },
    });
  }

  const events = await deps.findEvents({
    where: { id: { in: eventIds }, isPublished: true, deletedAt: null, startAt: { gte: new Date() } },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      timezone: true,
      description: true,
      startAt: true,
      endAt: true,
      venue: { select: { name: true, addressLine1: true } },
    },
  });

  const calendar = buildVCalendar(events.map((event) =>
    buildVEvent({
      uid: event.id,
      summary: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      timezone: event.timezone,
      location: venueLocation(event.venue?.name, event.venue?.addressLine1),
      description: event.description,
      url: getDetailUrl("event", event.slug),
    }),
  ));

  return new NextResponse(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="my-events.ics"',
      "cache-control": "private, no-store",
    },
  });
}
