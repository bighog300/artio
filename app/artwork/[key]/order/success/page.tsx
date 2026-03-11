import Link from "next/link";
import { FollowButton } from "@/components/follows/follow-button";
import { getSessionUser } from "@/lib/auth";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { db } from "@/lib/db";
import { publishedEventWhere } from "@/lib/publish-status";

function snippet(text: string | null | undefined, max = 140) {
  if (!text) return "Discover more from this artist.";
  const normalized = text.trim();
  if (!normalized) return "Discover more from this artist.";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}…`;
}

export default async function ArtworkOrderSuccessPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const isIdLookup = isArtworkIdKey(key);

  const artwork = await db.artwork.findFirst({
    where: isIdLookup
      ? { id: key, isPublished: true, deletedAt: null }
      : { slug: key, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      artistId: true,
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
          bio: true,
        },
      },
    },
  });

  if (!artwork) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <h1 className="text-3xl font-semibold">Thank you for your purchase</h1>
        <p className="text-muted-foreground">Your order is confirmed. You&apos;ll receive an email shortly.</p>
        <Link className="underline" href={`/artwork/${key}`}>
          Back to artwork
        </Link>
      </main>
    );
  }

  const user = await getSessionUser();
  const now = new Date();

  const [initialFollowing, artistFollowersCount, moreByArtist, artistEvents] = await Promise.all([
    user
      ? db.follow.findUnique({
        where: {
          userId_targetType_targetId: {
            userId: user.id,
            targetType: "ARTIST",
            targetId: artwork.artist.id,
          },
        },
        select: { id: true },
      }).then(Boolean)
      : Promise.resolve(false),
    db.follow.count({ where: { targetType: "ARTIST", targetId: artwork.artist.id } }),
    db.artwork.findMany({
      where: {
        artistId: artwork.artistId,
        id: { not: artwork.id },
        isPublished: true,
        deletedAt: null,
        soldAt: null,
      },
      select: { id: true, slug: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.event.findMany({
      where: {
        deletedAt: null,
        startAt: { gte: now },
        ...publishedEventWhere(),
        eventArtists: { some: { artistId: artwork.artistId } },
      },
      select: { id: true, slug: true, title: true },
      orderBy: { startAt: "asc" },
      take: 3,
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Thank you for your purchase</h1>
        <p className="text-muted-foreground">Your order is confirmed. You&apos;ll receive an email shortly.</p>
        <Link className="underline" href={`/artwork/${artwork.slug ?? artwork.id}`}>
          Back to artwork
        </Link>
      </section>

      <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <h2 className="text-lg font-semibold">Follow {artwork.artist.name}</h2>
        <p className="text-sm text-muted-foreground">{snippet(artwork.artist.bio)}</p>
        <FollowButton
          targetType="ARTIST"
          targetId={artwork.artist.id}
          initialIsFollowing={initialFollowing}
          initialFollowersCount={artistFollowersCount}
          isAuthenticated={Boolean(user)}
          analyticsSlug={artwork.artist.slug}
        />
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">More by {artwork.artist.name}</h2>
        {moreByArtist.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {moreByArtist.map((item) => (
              <li key={item.id}>
                <Link className="underline" href={`/artwork/${item.slug ?? item.id}`}>
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No additional available artworks right now.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">You might also like</h2>
        {artistEvents.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {artistEvents.map((event) => (
              <li key={event.id}>
                <Link className="underline" href={`/events/${event.slug}`}>
                  {event.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming events featuring this artist yet.</p>
        )}
      </section>
    </main>
  );
}
