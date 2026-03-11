import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardUser } from "@/lib/auth-guard";
import { buildIcalCalendar } from "@/lib/calendar/ical-format";
import { getDetailUrl } from "@/lib/seo.public-profiles";

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
    const emptyCalendar = buildIcalCalendar("Artio Saved Events", []);
    return new NextResponse(emptyCalendar, { headers: { "content-type": "text/calendar; charset=utf-8" } });
  }

  const events = await deps.findEvents({
    where: { id: { in: eventIds }, isPublished: true, deletedAt: null },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      startAt: true,
      endAt: true,
      venue: { select: { name: true, addressLine1: true } },
    },
  });

  const calendar = buildIcalCalendar(
    "Artio Saved Events",
    events.map((event) => ({
      uid: event.id,
      summary: event.title,
      dtstart: event.startAt,
      dtend: event.endAt,
      location: venueLocation(event.venue?.name, event.venue?.addressLine1),
      description: event.description,
      url: getDetailUrl("event", event.slug),
    })),
  );

  return new NextResponse(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
