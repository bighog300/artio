import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GetStartedEntryPoint } from "@/components/onboarding/get-started-entry-point";
import { PageShell } from "@/components/ui/page-shell";
import { Card } from "@/components/ui/card";
import { CuratedCollectionsRail } from "@/components/artwork/curated-collections-rail";
import { TrendingRail } from "@/components/artwork/trending-rail";
import { getTrendingArtworks30 } from "@/lib/artworks";

const publicTiles = [
  { title: "Browse events", description: "See what's coming up across exhibitions, openings, and talks.", href: "/events" },
  { title: "Find nearby", description: "Discover events around your current city or map area.", href: "/nearby" },
  { title: "Search", description: "Filter by keyword, city, venue, artist, and date.", href: "/search" },
];

const authedTiles = [
  { title: "For You", description: "Personalized picks based on your follows and activity.", href: "/for-you" },
  { title: "Following", description: "A feed from venues and artists you follow.", href: "/following" },
  { title: "Notifications", description: "Track invites, updates, and submission changes.", href: "/notifications" },
  { title: "Saved Searches", description: "Manage saved searches and alerts.", href: "/saved-searches" },
  { title: "Create / Manage Venue", description: "Create venues, edit details, and submit events.", href: "/my/venues" },
];

export default async function Home() {
  const user = await getSessionUser();
  const artist = user
    ? await db.artist.findUnique({
        where: { userId: user.id },
        select: { slug: true },
      })
    : null;
  const tiles = user ? authedTiles : publicTiles;
  const allTiles = artist
    ? [...tiles, { title: "My Artist Profile", description: "Manage your profile, artworks, and gallery.", href: "/my/artist" }]
    : tiles;
  const trending = await getTrendingArtworks30({ limit: 8 });

  return (
    <PageShell className="page-stack">
      <div className="section-stack">
        <h1 className="type-h1">Artio</h1>
        <p className="type-caption">Discover art events and keep up with the scenes you care about.</p>
      </div>

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

      {!user ? (
        <Link className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted" href="/login">
          Sign in
        </Link>
      ) : (
        <GetStartedEntryPoint />
      )}

      <CuratedCollectionsRail />
      <TrendingRail items={trending} />
    </PageShell>
  );
}
