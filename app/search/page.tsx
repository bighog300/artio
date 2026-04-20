import Link from "next/link";
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

type SearchTab = "events" | "galleries" | "creators" | "venues";
const TABS: Array<{ key: SearchTab; label: string }> = [
  { key: "events", label: "Events" },
  { key: "galleries", label: "Galleries" },
  { key: "creators", label: "Creators" },
  { key: "venues", label: "Venues" },
];

function normalizeTab(raw: string | undefined): SearchTab {
  if (raw === "galleries" || raw === "creators" || raw === "venues") return raw;
  return "events";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const raw = await searchParams;
  const tab = normalizeTab(Array.isArray(raw.tab) ? raw.tab[0] : raw.tab);
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
          subtitle="Find events, galleries, creators, and venues."
        />
        {user ? <SaveSearchCta /> : null}
        <p className="type-caption">Set DATABASE_URL to view search locally.</p>
      </PageShell>
    );
  }

  const tabLinks = TABS.map((entry) => {
    const params = new URLSearchParams();
    params.set("tab", entry.key);
    if (filters.query) params.set("query", filters.query);
    return { ...entry, href: `/search?${params.toString()}` };
  });

  let items: Parameters<typeof SearchResultsList>[0]["items"] = [];
  let nextCursor: string | undefined;

  if (tab === "events") {
    const tagList = (filters.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const box =
      filters.lat != null && filters.lng != null && filters.radiusKm != null
        ? getBoundingBox(filters.lat, filters.lng, filters.radiusKm)
        : null;

    const found = await db.event.findMany({
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

    nextCursor = found.length === filters.limit ? found[found.length - 1]?.id : undefined;
    items = found.map((item) => ({
      type: "event" as const,
      id: item.id,
      slug: item.slug,
      title: item.title,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt?.toISOString(),
      venueName: item.venue?.name,
      venueSlug: item.venue?.slug,
    }));
  }

  if (tab === "galleries") {
    const found = await db.collection.findMany({
      where: {
        isPublic: true,
        items: { some: { entityType: "ARTWORK" } },
        ...(filters.query
          ? {
              OR: [
                { title: { contains: filters.query, mode: "insensitive" } },
                { description: { contains: filters.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
      },
      take: filters.limit,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        user: { select: { username: true, displayName: true } },
        _count: { select: { followers: true, items: true } },
        items: { where: { entityType: "ARTWORK" }, orderBy: { createdAt: "asc" }, take: 1, select: { entityId: true } },
      },
    });
    nextCursor = found.length === filters.limit ? found[found.length - 1]?.id : undefined;
    const artworkIds = found.map((entry) => entry.items[0]?.entityId).filter(Boolean) as string[];
    const artworks = artworkIds.length
      ? await db.artwork.findMany({
          where: { id: { in: artworkIds } },
          select: {
            id: true,
            featuredAsset: { select: { url: true } },
            images: { take: 1, orderBy: { sortOrder: "asc" }, select: { asset: { select: { url: true } } } },
          },
        })
      : [];
    const artworkById = new Map(artworks.map((artwork) => [artwork.id, artwork]));
    items = found.map((item) => {
      const artwork = artworkById.get(item.items[0]?.entityId ?? "");
      return {
        type: "gallery" as const,
        id: item.id,
        title: item.title,
        description: item.description,
        coverUrl: artwork?.featuredAsset?.url ?? artwork?.images[0]?.asset?.url ?? null,
        creatorName: item.user.displayName ?? item.user.username,
        creatorHref: `/users/${item.user.username}`,
        itemCount: item._count.items,
        savesCount: item._count.followers,
      };
    });
  }

  if (tab === "creators") {
    const found = await db.artist.findMany({
      where: {
        isPublished: true,
        ...(filters.query
          ? {
              OR: [
                { name: { contains: filters.query, mode: "insensitive" } },
                { bio: { contains: filters.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
      },
      take: filters.limit,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, name: true, bio: true, _count: { select: { artworks: true } } },
    });
    nextCursor = found.length === filters.limit ? found[found.length - 1]?.id : undefined;
    items = found.map((item) => ({
      type: "creator" as const,
      id: item.id,
      slug: item.slug,
      name: item.name,
      bio: item.bio,
      artworksCount: item._count.artworks,
    }));
  }

  if (tab === "venues") {
    const found = await db.venue.findMany({
      where: {
        isPublished: true,
        ...(filters.query
          ? {
              OR: [
                { name: { contains: filters.query, mode: "insensitive" } },
                { city: { contains: filters.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
      },
      take: filters.limit,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, name: true, city: true },
    });
    nextCursor = found.length === filters.limit ? found[found.length - 1]?.id : undefined;
    items = found.map((item) => ({
      type: "venue" as const,
      id: item.id,
      slug: item.slug,
      name: item.name,
      city: item.city,
    }));
  }

  return (
    <PageShell className="page-stack">
      <PageHeader
        title="Search"
        subtitle="Find events, galleries, creators, and venues."
      />
      {user ? <SaveSearchCta /> : null}
      <nav className="flex flex-wrap gap-2" aria-label="Search entity tabs">
        {tabLinks.map((entry) => (
          <Link key={entry.key} href={entry.href} className={`rounded-full border px-3 py-1 text-sm ${tab === entry.key ? "bg-foreground text-background" : "hover:bg-muted"}`}>
            {entry.label}
          </Link>
        ))}
      </nav>
      {tab === "events" ? (
        <Suspense>
          <EventsFiltersBar queryParamName="query" />
        </Suspense>
      ) : null}
      <SearchResultsList
        items={items}
        query={filters.query}
        nextCursor={nextCursor}
      />
    </PageShell>
  );
}
