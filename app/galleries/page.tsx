import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { GalleryCard } from "@/components/galleries/gallery-card";

export const dynamic = "force-dynamic";

export default async function GalleriesPage() {
  const collections = await db.collection.findMany({
    where: {
      isPublic: true,
      items: { some: { entityType: "ARTWORK" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 48,
    select: {
      id: true,
      title: true,
      description: true,
      user: { select: { username: true, displayName: true, isCurator: true } },
      _count: { select: { items: true, followers: true } },
      items: {
        where: { entityType: "ARTWORK" },
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { entityId: true },
      },
    },
  });

  const artworkIds = collections.map((collection) => collection.items[0]?.entityId).filter(Boolean) as string[];
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

  return (
    <PageShell className="page-stack">
      <PageHeader title="Galleries" subtitle="Curated sequences of artworks from creators and collectors across Artio." />
      {!collections.length ? <p className="text-sm text-muted-foreground">No galleries available yet.</p> : null}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => {
          const coverId = collection.items[0]?.entityId;
          const artwork = coverId ? artworkById.get(coverId) : null;
          const cover = artwork?.featuredAsset?.url ?? artwork?.images[0]?.asset?.url ?? null;
          return (
            <GalleryCard
              key={collection.id}
              id={collection.id}
              title={collection.title}
              description={collection.description}
              coverUrl={cover}
              creator={{
                name: collection.user.displayName ?? collection.user.username,
                href: `/users/${collection.user.username}`,
                badge: collection.user.isCurator ? "Curator" : null,
              }}
              itemCount={collection._count.items}
              savesCount={collection._count.followers}
            />
          );
        })}
      </section>
    </PageShell>
  );
}
