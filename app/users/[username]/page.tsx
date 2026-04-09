import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { FollowButton } from "@/components/follows/follow-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await db.user.findUnique({ where: { username }, select: { username: true, displayName: true, bio: true, avatarUrl: true, isPublic: true } });
  if (!profile || !profile.isPublic) return { title: `@${username} · Artio` };
  return {
    title: `${profile.displayName ?? profile.username} · Artio`,
    description: profile.bio ?? `View ${profile.displayName ?? profile.username}'s activity and collections on Artio.`,
    openGraph: {
      title: `${profile.displayName ?? profile.username} · Artio`,
      description: profile.bio ?? `View ${profile.displayName ?? profile.username}'s activity and collections on Artio.`,
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : [],
    },
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sessionUser = await getSessionUser();

  const profile = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      isPublic: true,
      _count: { select: { favorites: true, collections: true } },
    },
  });

  if (!profile) notFound();
  const isSelf = sessionUser?.id === profile.id;
  if (!profile.isPublic && !isSelf) notFound();

  const [followingCount, followersCount, hasFollow, savedEvents, collections, following] = await Promise.all([
    db.follow.count({ where: { userId: profile.id } }),
    db.follow.count({ where: { targetType: "USER", targetId: profile.id } }),
    sessionUser ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: sessionUser.id, targetType: "USER", targetId: profile.id } }, select: { id: true } }) : Promise.resolve(null),
    db.favorite.findMany({
      where: { userId: profile.id, targetType: "EVENT" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { targetId: true, createdAt: true },
    }),
    db.collection.findMany({
      where: { userId: profile.id, ...(isSelf ? {} : { isPublic: true }) },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, description: true, isPublic: true, createdAt: true, _count: { select: { items: true } } },
    }),
    db.follow.findMany({
      where: { userId: profile.id, targetType: { in: ["ARTIST", "VENUE"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { targetType: true, targetId: true, createdAt: true },
    }),
  ]);

  const savedEventIds = savedEvents.map((item) => item.targetId);
  const savedEventRows = savedEventIds.length ? await db.event.findMany({ where: { id: { in: savedEventIds } }, select: { id: true, title: true, slug: true, startAt: true } }) : [];
  const savedEventMap = new Map(savedEventRows.map((item) => [item.id, item]));

  const artistIds = following.filter((item) => item.targetType === "ARTIST").map((item) => item.targetId);
  const venueIds = following.filter((item) => item.targetType === "VENUE").map((item) => item.targetId);
  const [artists, venues] = await Promise.all([
    artistIds.length ? db.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    venueIds.length ? db.venue.findMany({ where: { id: { in: venueIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
  ]);
  const artistMap = new Map(artists.map((item) => [item.id, item]));
  const venueMap = new Map(venues.map((item) => [item.id, item]));
  const recentActivity = [
    ...savedEvents.map((item) => {
      const event = savedEventMap.get(item.targetId);
      return event ? { id: `save-${item.targetId}-${item.createdAt.toISOString()}`, createdAt: item.createdAt, text: `Saved ${event.title}`, href: `/events/${event.slug}` } : null;
    }),
    ...collections.map((collection) => ({ id: `collection-${collection.id}`, createdAt: collection.createdAt, text: `Created collection ${collection.title}`, href: `/collections/${collection.id}` })),
    ...following.map((item) => {
      if (item.targetType === "ARTIST") {
        const artist = artistMap.get(item.targetId);
        return artist ? { id: `follow-artist-${item.targetId}-${item.createdAt.toISOString()}`, createdAt: item.createdAt, text: `Followed artist ${artist.name}`, href: `/artists/${artist.slug}` } : null;
      }
      const venue = venueMap.get(item.targetId);
      return venue ? { id: `follow-venue-${item.targetId}-${item.createdAt.toISOString()}`, createdAt: item.createdAt, text: `Followed venue ${venue.name}`, href: `/venues/${venue.slug}` } : null;
    }),
  ].filter((activity): activity is { id: string; createdAt: Date; text: string; href: string } => Boolean(activity))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  return (
    <main className="space-y-6 p-6">
      <section className="flex items-start gap-4 rounded-lg border p-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
          {profile.avatarUrl ? <Image src={profile.avatarUrl} alt={profile.displayName ?? profile.username} fill className="object-cover" sizes="64px" /> : null}
        </div>
        <div className="flex-1 space-y-2">
          <h1 className="text-2xl font-semibold">{profile.displayName || profile.username}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
          {profile.bio ? <p className="text-sm text-muted-foreground">{profile.bio}</p> : null}
          <div className="flex flex-wrap gap-4 text-sm">
            <span>{profile._count.favorites} saved</span>
            <span>{profile._count.collections} collections</span>
            <span>{followingCount} following</span>
            <span>{followersCount} followers</span>
          </div>
        </div>
        {!isSelf ? (
          <FollowButton
            targetType="USER"
            targetId={profile.id}
            initialIsFollowing={Boolean(hasFollow)}
            initialFollowersCount={followersCount}
            isAuthenticated={Boolean(sessionUser)}
            analyticsSlug={profile.username}
          />
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <div className="space-y-2">
          {recentActivity.map((activity) => (
            <Link key={activity.id} href={activity.href} className="block rounded border p-3 text-sm hover:bg-muted/50">
              <div>{activity.text}</div>
              <div className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Saved events</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {savedEvents.map((item) => { const event = savedEventMap.get(item.targetId); return event ? (
            <Link key={item.targetId} href={`/events/${event.slug}`} className="rounded border p-3 text-sm hover:bg-muted/50">
              <div className="font-medium">{event.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(event.startAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}</div>
            </Link>
          ) : null; })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Collections</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {collections.map((collection) => (
            <Link key={collection.id} href={`/collections/${collection.id}`} className="rounded border p-3 text-sm hover:bg-muted/50">
              <div className="font-medium">{collection.title}</div>
              <div className="text-xs text-muted-foreground">{collection._count.items} items{collection.isPublic ? "" : " · Private"}</div>
              {collection.description ? <p className="mt-1 text-xs text-muted-foreground">{collection.description}</p> : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Following</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {following.map((item, index) => {
            const target = item.targetType === "ARTIST" ? artistMap.get(item.targetId) : venueMap.get(item.targetId);
            if (!target) return null;
            const href = item.targetType === "ARTIST" ? `/artists/${target.slug}` : `/venues/${target.slug}`;
            return <Link key={`${item.targetType}-${index}`} href={href} className="rounded border p-3 text-sm hover:bg-muted/50">{target.name}</Link>;
          })}
        </div>
      </section>
    </main>
  );
}
