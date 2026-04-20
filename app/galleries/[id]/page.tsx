import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageShell } from "@/components/ui/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SaveGalleryButton } from "@/components/galleries/save-gallery-button";

export const dynamic = "force-dynamic";

export default async function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();

  const collection = await db.collection.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      isPublic: true,
      userId: true,
      user: { select: { username: true, displayName: true, bio: true, isCurator: true } },
      _count: { select: { followers: true } },
      items: {
        where: { entityType: "ARTWORK" },
        orderBy: { createdAt: "asc" },
        select: { id: true, entityId: true },
      },
    },
  });

  if (!collection) notFound();
  const isOwner = user?.id === collection.userId;
  if (!collection.isPublic && !isOwner) notFound();

  const artworkIds = collection.items.map((item) => item.entityId);
  const artworks = artworkIds.length
    ? await db.artwork.findMany({
        where: { id: { in: artworkIds }, isPublished: true, deletedAt: null },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          featuredAsset: { select: { url: true } },
          images: { take: 1, orderBy: { sortOrder: "asc" }, select: { asset: { select: { url: true } } } },
          artist: { select: { name: true, slug: true } },
          events: { select: { event: { select: { id: true, title: true, slug: true } } }, take: 4 },
        },
      })
    : [];

  const artworkById = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const orderedArtworks = collection.items.map((item) => artworkById.get(item.entityId)).filter(Boolean);

  const initialSaved = user
    ? Boolean(await db.collectionFollow.findUnique({ where: { userId_collectionId: { userId: user.id, collectionId: collection.id } }, select: { id: true } }))
    : false;

  const hero = orderedArtworks[0]?.featuredAsset?.url ?? orderedArtworks[0]?.images[0]?.asset?.url ?? null;
  const linkedEvents = new Map<string, { title: string; slug: string }>();
  for (const artwork of orderedArtworks) {
    for (const edge of artwork!.events) linkedEvents.set(edge.event.id, { title: edge.event.title, slug: edge.event.slug });
  }

  return (
    <PageShell className="page-stack">
      <Breadcrumbs items={[{ label: "Galleries", href: "/galleries" }, { label: collection.title, href: `/galleries/${collection.id}` }]} />
      <section className="overflow-hidden rounded-2xl border">
        <div className="relative h-64 w-full bg-muted">
          {hero ? <Image src={hero} alt={collection.title} fill className="object-cover" unoptimized /> : null}
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gallery</p>
            <h1 className="text-2xl font-semibold">{collection.title}</h1>
            {collection.description ? <p className="text-sm text-muted-foreground">{collection.description}</p> : null}
            <div className="text-xs text-muted-foreground">
              Curated by <Link className="underline" href={`/users/${collection.user.username}`}>{collection.user.displayName ?? collection.user.username}</Link>
              {collection.user.isCurator ? " · Curator" : ""}
              {` · ${collection._count.followers} saves`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveGalleryButton galleryId={collection.id} signedIn={Boolean(user)} initialSaved={initialSaved} nextUrl={`/galleries/${collection.id}`} />
            <Link href={`/users/${collection.user.username}`} className="rounded-md border px-3 py-2 text-sm">View creator</Link>
          </div>
          {collection.user.bio ? <p className="text-sm text-muted-foreground">{collection.user.bio}</p> : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Gallery sequence</h2>
        <ol className="space-y-3">
          {orderedArtworks.map((artwork, index) => {
            const cover = artwork!.featuredAsset?.url ?? artwork!.images[0]?.asset?.url ?? null;
            return (
              <li key={artwork!.id} className="rounded-xl border p-3">
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Link href={`/artwork/${artwork!.slug ?? artwork!.id}`} className="relative block h-32 overflow-hidden rounded bg-muted">
                    {cover ? <Image src={cover} alt={artwork!.title} fill className="object-cover" unoptimized /> : null}
                  </Link>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">#{index + 1} in gallery order</p>
                    <Link href={`/artwork/${artwork!.slug ?? artwork!.id}`} className="font-medium underline">{artwork!.title}</Link>
                    <p className="text-sm text-muted-foreground">by <Link href={`/artists/${artwork!.artist.slug}`} className="underline">{artwork!.artist.name}</Link></p>
                    {artwork!.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{artwork!.description}</p> : <p className="text-sm text-muted-foreground">No commentary provided.</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {linkedEvents.size > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Related events</h2>
          <div className="flex flex-wrap gap-2">
            {Array.from(linkedEvents.entries()).slice(0, 8).map(([eventId, event]) => (
              <Link key={eventId} href={`/events/${event.slug}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">{event.title}</Link>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
