import Image from "next/image";
import Link from "next/link";
import { redirectToLogin } from "@/lib/auth-redirect";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export default async function MyCollectionPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/collection");

  const [orders, favorites, followedArtistsCount] = await Promise.all([
    db.artworkOrder.findMany({
      where: { buyerUserId: user.id, status: "CONFIRMED" },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        amountPaid: true,
        currency: true,
        confirmedAt: true,
        createdAt: true,
        artwork: {
          select: {
            id: true,
            title: true,
            slug: true,
            priceAmount: true,
            currency: true,
            images: { select: { asset: { select: { url: true } } }, orderBy: { sortOrder: "asc" }, take: 1 },
            artist: { select: { name: true, slug: true } },
          },
        },
      },
    }),
    db.favorite.findMany({
      where: { userId: user.id, targetType: "ARTWORK" },
      orderBy: { createdAt: "desc" },
      select: { id: true, targetId: true },
    }),
    db.follow.count({ where: { userId: user.id, targetType: "ARTIST" } }),
  ]);

  const favoriteArtworkIds = favorites.map((favorite) => favorite.targetId);
  const favoriteArtworks = favoriteArtworkIds.length
    ? await db.artwork.findMany({
        where: { id: { in: favoriteArtworkIds } },
        select: {
          id: true,
          title: true,
          slug: true,
          priceAmount: true,
          currency: true,
          soldAt: true,
          images: { select: { asset: { select: { url: true } } }, orderBy: { sortOrder: "asc" }, take: 1 },
          artist: { select: { name: true, slug: true } },
        },
      })
    : [];

  const favoriteArtworkById = new Map(favoriteArtworks.map((artwork) => [artwork.id, artwork]));
  const savedArtworks = favoriteArtworkIds
    .map((artworkId) => favoriteArtworkById.get(artworkId))
    .filter((artwork): artwork is NonNullable<typeof artwork> => Boolean(artwork));

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">My Collection</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Purchased works</h2>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">No purchased works yet.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const imageUrl = order.artwork.images[0]?.asset.url;
            const artworkKey = order.artwork.slug ?? order.artwork.id;

            return (
              <Link key={order.id} href={`/artwork/${artworkKey}`} className="rounded border p-3 hover:bg-muted/40">
                <div className="relative mb-3 h-44 overflow-hidden rounded bg-muted">
                  {imageUrl ? <Image src={imageUrl} alt={order.artwork.title} fill className="object-cover" /> : null}
                </div>
                <p className="font-medium">{order.artwork.title}</p>
                <p className="text-sm text-muted-foreground">{order.artwork.artist.name}</p>
                <p className="text-sm">{formatPrice(order.amountPaid, order.currency)}</p>
                <p className="text-xs text-muted-foreground">Purchased {new Date(order.confirmedAt ?? order.createdAt).toLocaleDateString()}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saved artworks</h2>
        {savedArtworks.length === 0 ? <p className="text-sm text-muted-foreground">No saved artworks yet.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {savedArtworks.map((artwork) => {
            const imageUrl = artwork.images[0]?.asset.url;
            const artworkKey = artwork.slug ?? artwork.id;

            return (
              <Link key={artwork.id} href={`/artwork/${artworkKey}`} className="relative rounded border p-3 hover:bg-muted/40">
                {artwork.soldAt ? <span className="absolute right-3 top-3 rounded bg-foreground px-2 py-0.5 text-xs text-background">SOLD</span> : null}
                <div className="relative mb-3 h-44 overflow-hidden rounded bg-muted">
                  {imageUrl ? <Image src={imageUrl} alt={artwork.title} fill className="object-cover" /> : null}
                </div>
                <p className="font-medium">{artwork.title}</p>
                <p className="text-sm text-muted-foreground">{artwork.artist.name}</p>
                {artwork.priceAmount != null && artwork.currency ? <p className="text-sm">{formatPrice(artwork.priceAmount, artwork.currency)}</p> : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-semibold">Following {followedArtistsCount} artists</h2>
        <Link className="text-sm underline" href="/following">View following</Link>
      </section>
    </main>
  );
}
