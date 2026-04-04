import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { CollectionSortMode, getPublishedCuratedCollectionBySlug } from "@/lib/curated-collections";
import { getArtworkPublicHref } from "@/lib/artworks";
import { collectionPageQuerySchema } from "@/lib/validators";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const revalidate = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sortOptions: Array<{ label: string; value: CollectionSortMode }> = [
  { label: "Curated order", value: "CURATED" },
  { label: "Most viewed (30d)", value: "VIEWS_30D_DESC" },
  { label: "Newest", value: "NEWEST" },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!UUID_RE.test(slug)) {
    const curated = await getPublishedCuratedCollectionBySlug(slug, { sort: "CURATED", page: 1, pageSize: 1 });
    return {
      title: curated?.title ? `${curated.title} · Artio` : "Collection · Artio",
      description: curated?.description ?? "Explore this collection on Artio.",
      openGraph: {
        title: curated?.title ? `${curated.title} · Artio` : "Collection · Artio",
        description: curated?.description ?? "Explore this collection on Artio.",
      },
    };
  }

  const collection = await db.collection.findUnique({
    where: { id: slug },
    select: { title: true, description: true, isPublic: true, user: { select: { username: true, displayName: true, isCurator: true } } },
  });
  if (!collection || !collection.isPublic) return { title: "Collection · Artio" };
  return {
    title: `${collection.title} · Artio`,
    description: collection.description ?? `Collection by ${collection.user.displayName ?? collection.user.username}`,
    openGraph: {
      title: `${collection.title} · Artio`,
      description: collection.description ?? `Collection by ${collection.user.displayName ?? collection.user.username}`,
    },
  };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;

  if (UUID_RE.test(slug)) {
    const sessionUser = await getSessionUser();
    const collection = await db.collection.findUnique({
      where: { id: slug },
      select: {
        id: true,
        title: true,
        description: true,
        isPublic: true,
        userId: true,
        user: { select: { username: true, displayName: true, isCurator: true } },
        items: { orderBy: { createdAt: "asc" }, select: { id: true, entityType: true, entityId: true } },
      },
    });
    if (!collection) notFound();
    const isOwner = sessionUser?.id === collection.userId;
    if (!collection.isPublic && !isOwner) notFound();

    const eventIds = collection.items.filter((item) => item.entityType === "EVENT").map((item) => item.entityId);
    const artistIds = collection.items.filter((item) => item.entityType === "ARTIST").map((item) => item.entityId);
    const venueIds = collection.items.filter((item) => item.entityType === "VENUE").map((item) => item.entityId);
    const artworkIds = collection.items.filter((item) => item.entityType === "ARTWORK").map((item) => item.entityId);
    const [events, artists, venues, artworks] = await Promise.all([
      eventIds.length ? db.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
      artistIds.length ? db.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
      venueIds.length ? db.venue.findMany({ where: { id: { in: venueIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
      artworkIds.length ? db.artwork.findMany({ where: { id: { in: artworkIds } }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    ]);
    const eventMap = new Map(events.map((item) => [item.id, item]));
    const artistMap = new Map(artists.map((item) => [item.id, item]));
    const venueMap = new Map(venues.map((item) => [item.id, item]));
    const artworkMap = new Map(artworks.map((item) => [item.id, item]));

    return (
      <PageShell className="page-stack">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{collection.title}</h1>
          {collection.description ? <p className="text-sm text-muted-foreground">{collection.description}</p> : null}
          <p className="text-xs text-muted-foreground">By <Link className="underline" href={`/users/${collection.user.username}`}>{collection.user.displayName || collection.user.username}</Link>{collection.user.isCurator ? " · ✓ Curator" : ""}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {collection.items.map((item) => {
            if (item.entityType === "EVENT") {
              const event = eventMap.get(item.entityId);
              if (!event) return null;
              return <Link key={item.id} href={`/events/${event.slug}`} className="rounded border p-3">{event.title}</Link>;
            }
            if (item.entityType === "ARTIST") {
              const artist = artistMap.get(item.entityId);
              if (!artist) return null;
              return <Link key={item.id} href={`/artists/${artist.slug}`} className="rounded border p-3">{artist.name}</Link>;
            }
            if (item.entityType === "VENUE") {
              const venue = venueMap.get(item.entityId);
              if (!venue) return null;
              return <Link key={item.id} href={`/venues/${venue.slug}`} className="rounded border p-3">{venue.name}</Link>;
            }
            const artwork = artworkMap.get(item.entityId);
            if (!artwork) return null;
            return <Link key={item.id} href={`/artwork/${artwork.slug}`} className="rounded border p-3">{artwork.title}</Link>;
          })}
        </div>
      </PageShell>
    );
  }

  const parsed = collectionPageQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 48, sort: "CURATED" as CollectionSortMode };

  const collection = await getPublishedCuratedCollectionBySlug(slug, {
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
  if (!collection) notFound();

  const totalPages = Math.max(1, Math.ceil((collection.itemCount ?? 0) / query.pageSize));

  return (
    <PageShell className="page-stack">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{collection.title}</h1>
        {collection.description ? <p className="text-sm text-muted-foreground">{collection.description}</p> : null}
        <p className="text-xs text-muted-foreground">{collection.itemCount ?? collection.artworks.length} items</p>
      </div>

      <form className="flex items-center gap-2" method="get">
        <label className="text-sm" htmlFor="sort">Sort</label>
        <select id="sort" name="sort" defaultValue={query.sort} className="rounded border px-2 py-1 text-sm">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input type="hidden" name="page" value="1" />
        <button className="rounded border px-2 py-1 text-sm" type="submit">Apply</button>
      </form>

      {!collection.artworks.length ? <p className="rounded border bg-muted/40 p-4 text-sm">This collection is being updated.</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {collection.artworks.map((artwork) => (
            <Link key={artwork.id} href={getArtworkPublicHref(artwork)} className="rounded border p-2">
              <div className="relative mb-2 h-40 overflow-hidden rounded bg-muted">
                {artwork.coverUrl ? <Image src={artwork.coverUrl} alt={artwork.title} fill className="object-cover" unoptimized /> : null}
              </div>
              <div className="font-medium">{artwork.title}</div>
              <div className="text-xs text-muted-foreground">{artwork.artist.name}</div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span>Page {query.page} of {totalPages}</span>
          <div className="flex gap-2">
            {query.page > 1 ? <Link className="underline" href={`/collections/${slug}?sort=${query.sort}&page=${query.page - 1}&pageSize=${query.pageSize}`}>Previous</Link> : <span className="text-muted-foreground">Previous</span>}
            {query.page < totalPages ? <Link className="underline" href={`/collections/${slug}?sort=${query.sort}&page=${query.page + 1}&pageSize=${query.pageSize}`}>Next</Link> : <span className="text-muted-foreground">Next</span>}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
