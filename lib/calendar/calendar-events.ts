import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";
import { paramsToObject, zodDetails } from "@/lib/validators";
import { z } from "zod";
import { resolveEntityPrimaryImage } from "@/lib/public-images";

const calendarEventsQuerySchema = z.object({
  scope: z.enum(["all", "saved", "following"]).default("all"),
  from: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).or(z.iso.date().transform((value) => `${value}T00:00:00Z`)),
  to: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).or(z.iso.date().transform((value) => `${value}T23:59:59.999Z`)),
  q: z.string().trim().min(1).max(120).optional(),
  tags: z.string().optional(),
  sort: z.string().optional(),
}).superRefine((value, ctx) => {
  if (new Date(value.from).getTime() > new Date(value.to).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from must be <= to" });
  }
});

type CalendarEventRow = {
  id: string;
  title: string;
  slug: string;
  startAt: Date;
  endAt: Date | null;
  venue: { id: string; name: string } | null;
  eventArtists: Array<{ artistId: string }>;
  images: Array<{ url?: string | null; alt?: string | null; sortOrder?: number | null; isPrimary?: boolean | null; asset?: { url?: string | null } | null }>;
};

export type CalendarEventDeps = {
  getUser: typeof guardUser;
  findFavorites: typeof db.favorite.findMany;
  findFollows: typeof db.follow.findMany;
  findEvents: typeof db.event.findMany;
};

const eventSelect = {
  id: true,
  title: true,
  slug: true,
  startAt: true,
  endAt: true,
  venue: { select: { id: true, name: true } },
  eventArtists: { select: { artistId: true } },
  images: { orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true } } } },
} satisfies Prisma.EventFindManyArgs["select"];

function rangePredicate(from: Date, to: Date): Prisma.EventWhereInput {
  return {
    AND: [
      { startAt: { lte: to } },
      { OR: [{ endAt: null }, { endAt: { gte: from } }] },
    ],
  };
}

function mapCalendarItems(items: CalendarEventRow[]) {
  return items.map((event) => {
    const image = resolveEntityPrimaryImage(event);
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      start: event.startAt.toISOString(),
      end: event.endAt?.toISOString() ?? null,
      venue: event.venue,
      artistIds: event.eventArtists.map((eventArtist) => eventArtist.artistId),
      featuredImageUrl: image?.url ?? null,
    };
  });
}

export async function handleCalendarEventsGet(req: Request, deps: CalendarEventDeps = {
  getUser: guardUser,
  findFavorites: db.favorite.findMany.bind(db.favorite),
  findFollows: db.follow.findMany.bind(db.follow),
  findEvents: db.event.findMany.bind(db.event),
}) {
  const parsed = calendarEventsQuerySchema.safeParse(paramsToObject(new URL(req.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));
  }

  const { scope, from, to } = parsed.data;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const baseWhere: Prisma.EventWhereInput = { isPublished: true, ...rangePredicate(fromDate, toDate) };

  if (scope === "all") {
    const items = await deps.findEvents({ where: baseWhere, orderBy: [{ startAt: "asc" }, { id: "asc" }], take: 1000, select: eventSelect }) as CalendarEventRow[];
    return NextResponse.json({ items: mapCalendarItems(items) });
  }

  const user = await deps.getUser();
  if (user instanceof NextResponse) return user;

  if (scope === "saved") {
    const favorites = await deps.findFavorites({ where: { userId: user.id, targetType: "EVENT" }, select: { targetId: true } });
    const savedIds = favorites.map((favorite) => favorite.targetId);
    if (savedIds.length === 0) return NextResponse.json({ items: [] });
    const items = await deps.findEvents({ where: { ...baseWhere, id: { in: savedIds } }, orderBy: [{ startAt: "asc" }, { id: "asc" }], take: 1000, select: eventSelect }) as CalendarEventRow[];
    return NextResponse.json({ items: mapCalendarItems(items) });
  }

  const follows = await deps.findFollows({ where: { userId: user.id }, select: { targetType: true, targetId: true } });
  const followedVenueIds = follows.filter((follow) => follow.targetType === "VENUE").map((follow) => follow.targetId);
  const followedArtistIds = follows.filter((follow) => follow.targetType === "ARTIST").map((follow) => follow.targetId);
  if (followedVenueIds.length === 0 && followedArtistIds.length === 0) return NextResponse.json({ items: [] });

  const orFilters: Prisma.EventWhereInput[] = [];
  if (followedVenueIds.length) orFilters.push({ venueId: { in: followedVenueIds } });
  if (followedArtistIds.length) orFilters.push({ eventArtists: { some: { artistId: { in: followedArtistIds } } } });

  const items = await deps.findEvents({
    where: { ...baseWhere, OR: orFilters },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 1000,
    select: eventSelect,
  }) as CalendarEventRow[];
  return NextResponse.json({ items: mapCalendarItems(items) });
}
