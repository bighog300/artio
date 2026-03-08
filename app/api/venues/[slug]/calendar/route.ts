import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildIcalCalendar } from "@/lib/calendar/ical-format";
import { getDetailUrl } from "@/lib/seo.public-profiles";

export const runtime = "nodejs";

function venueLocation(name?: string | null, address?: string | null) {
  return [name?.trim(), address?.trim()].filter(Boolean).join(", ");
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await db.venue.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      addressLine1: true,
      events: {
        where: { isPublished: true, deletedAt: null, startAt: { gte: new Date() } },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          startAt: true,
          endAt: true,
        },
      },
    },
  });

  if (!venue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const calendar = buildIcalCalendar(
    `${venue.name} Events`,
    venue.events.map((event) => ({
      uid: event.id,
      summary: event.title,
      dtstart: event.startAt,
      dtend: event.endAt,
      location: venueLocation(venue.name, venue.addressLine1),
      description: event.description,
      url: getDetailUrl("event", event.slug),
    })),
  );

  return new NextResponse(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
