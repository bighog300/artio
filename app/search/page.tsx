import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { eventsQuerySchema } from "@/lib/validators";
import { SaveSearchCta } from "@/components/search/save-search-cta";
import { getSessionUser } from "@/lib/auth";
import { SearchResultsList } from "@/app/search/search-results-list";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { getBoundingBox } from "@/lib/geo";
import { EventsFiltersBar } from "@/components/events/events-filters-bar";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const raw = await searchParams;
  const parsed = eventsQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    ),
  );
  const filters = parsed.success ? parsed.data : { limit: 20 };

  if (!hasDatabaseUrl()) {
    return (
      <PageShell className="page-stack">
        <PageHeader
          title="Search"
          subtitle="Find events by keyword, date, tags, venue, and artist."
        />
        {user ? <SaveSearchCta /> : null}
        <p className="type-caption">Set DATABASE_URL to view events locally.</p>
      </PageShell>
    );
  }

  const tagList = (filters.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const box =
    filters.lat != null && filters.lng != null && filters.radiusKm != null
      ? getBoundingBox(filters.lat, filters.lng, filters.radiusKm)
      : null;

  const items = await db.event.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      ...(filters.query
        ? {
            OR: [
              { title: { contains: filters.query, mode: "insensitive" } },
              { description: { contains: filters.query, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.from || filters.to
        ? {
            startAt: {
              gte: filters.from ? new Date(filters.from) : undefined,
              lte: filters.to ? new Date(filters.to) : undefined,
            },
          }
        : {}),
      ...(filters.venue ? { venue: { slug: filters.venue } } : {}),
      ...(filters.artist
        ? {
            eventArtists: {
              some: { artist: { slug: filters.artist, isPublished: true } },
            },
          }
        : {}),
      ...(tagList.length
        ? { eventTags: { some: { tag: { slug: { in: tagList } } } } }
        : {}),
      ...(box
        ? {
            AND: [
              {
                OR: [
                  {
                    lat: { gte: box.minLat, lte: box.maxLat },
                    lng: { gte: box.minLng, lte: box.maxLng },
                  },
                  {
                    venue: {
                      lat: { gte: box.minLat, lte: box.maxLat },
                      lng: { gte: box.minLng, lte: box.maxLng },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
      ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
    },
    take: filters.limit,
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    include: { venue: { select: { name: true, slug: true } } },
  });

  const nextCursor =
    items.length === filters.limit
      ? items[items.length - 1]?.id
      : undefined;

  return (
    <PageShell className="page-stack">
      <PageHeader
        title="Search"
        subtitle="Find events by keyword, date, tags, venue, and artist."
      />
      {user ? <SaveSearchCta /> : null}
      <Suspense>
        <EventsFiltersBar queryParamName="query" />
      </Suspense>
      <SearchResultsList
        items={items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          startAt: item.startAt.toISOString(),
          endAt: item.endAt?.toISOString(),
          venueName: item.venue?.name,
          venueSlug: item.venue?.slug,
        }))}
        query={filters.query}
        nextCursor={nextCursor}
      />
    </PageShell>
  );
}
