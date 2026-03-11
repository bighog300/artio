import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildIcalCalendar } from "@/lib/calendar/ical-format";
import { getDetailUrl } from "@/lib/seo.public-profiles";

function venueLocation(name?: string | null, address?: string | null) {
  return [name?.trim(), address?.trim()].filter(Boolean).join(", ");
}

type EventIcalDeps = {
  findEvent: typeof db.event.findFirst;
};

export async function handleEventIcalGet(
  params: Promise<{ slug: string }>,
  deps: EventIcalDeps = { findEvent: db.event.findFirst.bind(db.event) },
) {
  const { slug } = await params;
  const event = await deps.findEvent({
    where: { slug, isPublished: true, deletedAt: null },
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

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const calendar = buildIcalCalendar("Artio Event", [
    {
      uid: event.id,
      summary: event.title,
      dtstart: event.startAt,
      dtend: event.endAt,
      location: venueLocation(event.venue?.name, event.venue?.addressLine1),
      description: event.description,
      url: getDetailUrl("event", event.slug),
    },
  ]);

  return new NextResponse(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.slug}.ics"`,
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
