import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GetStartedEntryPoint } from "@/components/onboarding/get-started-entry-point";
import { PageShell } from "@/components/ui/page-shell";
import { Card } from "@/components/ui/card";
import { CuratedCollectionsRail } from "@/components/artwork/curated-collections-rail";
import { TrendingRail } from "@/components/artwork/trending-rail";
import { getTrendingArtworks30 } from "@/lib/artworks";
import { TrendingEvents } from "@/components/events/trending-events";
import { TrendingCollectionsRail } from "@/components/collections/trending-collections-rail";
import { NetworkCollectionsRail } from "@/components/collections/network-collections-rail";

export const dynamic = "force-dynamic";

const publicTiles = [
  { title: "Browse events", description: "See what's coming up across exhibitions, openings, and talks.", href: "/events" },
  { title: "Find nearby", description: "Discover events around your current city or map area.", href: "/nearby" },
  { title: "Search", description: "Filter by keyword, city, venue, artist, and date.", href: "/search" },
  { title: "Browse galleries", description: "Explore curated gallery sequences created by artists and collectors.", href: "/galleries" },
];

const authedTiles = [
  { title: "For You", description: "Personalized picks based on your follows and activity.", href: "/for-you" },
  { title: "Following", description: "A feed from venues and artists you follow.", href: "/following" },
  { title: "Notifications", description: "Track invites, updates, and submission changes.", href: "/notifications" },
  { title: "Saved Searches", description: "Manage saved searches and alerts.", href: "/saved-searches" },
  { title: "Galleries", description: "Browse and save curated galleries.", href: "/galleries" },
  { title: "Create / Manage Venue", description: "Create venues, edit details, and submit events.", href: "/my/venues" },
];

export default async function Home() {
  const user = await getSessionUser();
  let artist: { slug: string } | null = null;
  if (user) {
    try {
      artist = await db.artist.findUnique({
        where: { userId: user.id },
        select: { slug: true },
      });
    } catch (err) {
      console.error("[Home] DB error:", err);
      artist = null;
    }
  }
  const tiles = user ? authedTiles : publicTiles;
  const allTiles = artist
    ? [...tiles, { title: "My Artist Profile", description: "Manage your profile, artworks, and gallery.", href: "/my/artist" }]
    : tiles;
  const trending = await getTrendingArtworks30({ limit: 8 });

  return (
    <PageShell className="page-stack">
      <section className="section-stack rounded-2xl border border-border bg-card px-6 py-10 md:px-10 md:py-14">
        <div className="max-w-2xl space-y-3">
          <h1 className="type-h1">
            Discover the art scenes<br className="hidden md:block" /> you care about
          </h1>
          <p className="type-caption text-base">
            Artio surfaces exhibitions, openings, talks, and fairs — from your local galleries to international art fairs — and keeps you up with the venues and artists you follow.
          </p>
        </div>
        {!user ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/events"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
            >
              Browse events
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <GetStartedEntryPoint />
        )}
      </section>

      <section className="card-grid">
        {allTiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="block">
            <Card className="h-full p-5 transition ui-hover-lift ui-press">
              <h2 className="type-h3">{tile.title}</h2>
              <p className="mt-2 type-caption">{tile.description}</p>
            </Card>
          </Link>
        ))}
      </section>

      <CuratedCollectionsRail />
      <NetworkCollectionsRail />
      <TrendingCollectionsRail />
      <TrendingEvents />
      <TrendingRail items={trending} />
    </PageShell>
  );
}
