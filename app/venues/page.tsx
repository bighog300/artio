import { VenuesClient } from "@/app/venues/venues-client";
import { DataSourceEmptyState } from "@/components/ui/data-source-empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { useUiFixtures as getUiFixturesEnabled, uiFixtureVenues } from "@/lib/ui-fixtures";
import { resolveEntityPrimaryImage } from "@/lib/public-images";

export const revalidate = 300;
const fixturesEnabled = getUiFixturesEnabled();

export default async function VenuesPage() {
  const user = await getSessionUser();
  let cities: string[] = [];

  if (!hasDatabaseUrl() && !fixturesEnabled) {
    return (
      <PageShell className="page-stack">
        <PageHeader title="Venues" subtitle="Find spaces for exhibitions, performances, and shows." />
        <DataSourceEmptyState isAdmin={user?.role === "ADMIN"} showDevHint={process.env.NODE_ENV === "development"} />
      </PageShell>
    );
  }

  let venues: Array<{ id: string; slug: string; name: string; subtitle: string; description: string | null; imageUrl: string | null; image: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null; imageAlt: string | null; followersCount: number; isFollowing: boolean; artworkCount: number }> = [];

  if (hasDatabaseUrl()) {
    const dbVenues = await db.venue.findMany({
      where: { isPublished: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, city: true, region: true, country: true, description: true, featuredImageUrl: true, images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } } },
    });
    cities = Array.from(new Set(dbVenues.map((v) => v.city).filter(Boolean))).sort() as string[];
    const ids = dbVenues.map((venue) => venue.id);
    const [followerCounts, userFollows, artworkCounts] = await Promise.all([
      ids.length ? db.follow.groupBy({ by: ["targetId"], where: { targetType: "VENUE", targetId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
      user && ids.length ? db.follow.findMany({ where: { userId: user.id, targetType: "VENUE", targetId: { in: ids } }, select: { targetId: true } }) : Promise.resolve([]),
      ids.length ? db.artworkVenue.groupBy({ by: ["venueId"], where: { venueId: { in: ids }, artwork: { isPublished: true, deletedAt: null } }, _count: { _all: true } }) : Promise.resolve([]),
    ]);
    const countById = new Map(followerCounts.map((entry) => [entry.targetId, entry._count._all]));
    const followedSet = new Set(userFollows.map((row) => row.targetId));
    const artworkCountByVenueId = new Map(artworkCounts.map((entry) => [entry.venueId, entry._count._all]));

    venues = dbVenues.map((venue) => {
      const image = resolveEntityPrimaryImage(venue);
      return {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        subtitle: [venue.city, venue.region, venue.country].filter(Boolean).join(", ") || "Location unavailable",
        description: venue.description,
        imageUrl: image?.url ?? null,
        image,
        imageAlt: image?.alt ?? venue.name,
        followersCount: countById.get(venue.id) ?? 0,
        isFollowing: followedSet.has(venue.id),
        artworkCount: artworkCountByVenueId.get(venue.id) ?? 0,
      };
    });
  } else {
    cities = Array.from(new Set(uiFixtureVenues.map((v) => v.city).filter(Boolean))).sort() as string[];
    venues = uiFixtureVenues.map((venue) => {
      const image = resolveEntityPrimaryImage(venue);
      return {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        subtitle: [venue.city, venue.region, venue.country].filter(Boolean).join(", ") || "Location unavailable",
        description: venue.description,
        imageUrl: image?.url ?? null,
        image,
        imageAlt: image?.alt ?? venue.name,
        followersCount: 0,
        isFollowing: false,
        artworkCount: 0,
      };
    });
  }

  return (
    <PageShell className="page-stack">
      <PageHeader title="Venues" subtitle="Find spaces for exhibitions, performances, and shows." />
      <VenuesClient venues={venues} cities={cities} isAuthenticated={Boolean(user)} />
    </PageShell>
  );
}
