import { ArtistsClient } from "@/app/artists/artists-client";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { DataSourceEmptyState } from "@/components/ui/data-source-empty-state";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { uiFixtureArtists, useUiFixtures as getUiFixturesEnabled } from "@/lib/ui-fixtures";
import { resolveEntityPrimaryImage } from "@/lib/public-images";

export const revalidate = 300;
const fixturesEnabled = getUiFixturesEnabled();

export default async function ArtistsPage() {
  const user = await getSessionUser();
  let total = 0;

  if (!hasDatabaseUrl() && !fixturesEnabled) {
    return (
      <PageShell className="page-stack">
        <PageHeader title="Artists" subtitle="Discover artists and follow the creators you care about." />
        <DataSourceEmptyState isAdmin={user?.role === "ADMIN"} showDevHint={process.env.NODE_ENV === "development"} />
      </PageShell>
    );
  }

  let artists: Array<{ id: string; name: string; slug: string; bio: string | null; avatarImageUrl: string | null; imageAlt: string | null; tags: string[]; followersCount: number; isFollowing: boolean; artworkCount: number }> = [];

  if (hasDatabaseUrl()) {
    const dbArtists = await db.artist.findMany({
      where: { isPublished: true, deletedAt: null },
      orderBy: { name: "asc" },
      take: 48,
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        avatarImageUrl: true,
        featuredImageUrl: true,
        mediums: true,
        images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
        eventArtists: { where: { event: { isPublished: true, deletedAt: null } }, take: 8, select: { event: { select: { eventTags: { select: { tag: { select: { slug: true } } } } } } } },
      },
    });
    const ids = dbArtists.map((artist) => artist.id);
    const [followerCounts, userFollows, artworkCounts, artistCount] = await Promise.all([
      ids.length ? db.follow.groupBy({ by: ["targetId"], where: { targetType: "ARTIST", targetId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
      user && ids.length ? db.follow.findMany({ where: { userId: user.id, targetType: "ARTIST", targetId: { in: ids } }, select: { targetId: true } }) : Promise.resolve([]),
      ids.length ? db.artwork.groupBy({ by: ["artistId"], where: { isPublished: true, deletedAt: null, artistId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
      db.artist.count({ where: { isPublished: true, deletedAt: null } }),
    ]);
    total = artistCount;
    const countById = new Map(followerCounts.map((entry) => [entry.targetId, entry._count._all]));
    const followedSet = new Set(userFollows.map((row) => row.targetId));
    const artworkCountByArtistId = new Map(artworkCounts.map((entry) => [entry.artistId, entry._count._all]));
    artists = dbArtists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      bio: artist.bio,
      avatarImageUrl: resolveEntityPrimaryImage(artist)?.url ?? artist.avatarImageUrl,
      imageAlt: resolveEntityPrimaryImage(artist)?.alt ?? artist.name,
      tags:
        artist.mediums.length > 0
          ? Array.from(new Set(artist.mediums)).slice(0, 6)
          : Array.from(new Set(artist.eventArtists.flatMap((row) => row.event.eventTags.map(({ tag }) => tag.slug)))).slice(0, 6),
      followersCount: countById.get(artist.id) ?? 0,
      isFollowing: followedSet.has(artist.id),
      artworkCount: artworkCountByArtistId.get(artist.id) ?? 0,
    }));
  } else {
    artists = uiFixtureArtists.map((artist) => ({ ...artist, avatarImageUrl: resolveEntityPrimaryImage(artist)?.url ?? artist.avatarImageUrl, imageAlt: resolveEntityPrimaryImage(artist)?.alt ?? artist.name, tags: artist.tags ?? [], followersCount: 0, isFollowing: false, artworkCount: 0 }));
    total = artists.length;
  }

  return (
    <PageShell className="page-stack">
      <PageHeader title="Artists" subtitle="Discover artists and follow the creators you care about." />
      <ArtistsClient artists={artists} total={total} isAuthenticated={Boolean(user)} />
    </PageShell>
  );
}
