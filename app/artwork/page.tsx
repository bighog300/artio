import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { ArtworkBrowser } from "@/app/artwork/artwork-browser";
import { CuratedCollectionsRail } from "@/components/artwork/curated-collections-rail";
import { TrendingRail } from "@/components/artwork/trending-rail";
import { getTrendingArtworks30 } from "@/lib/artworks";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ArtworkPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function hasActiveArtworkFilters(params: Record<string, string | string[] | undefined>) {
  return Object.keys(params).some((key) => !["page", "sort"].includes(key));
}

export default async function ArtworkPage({ searchParams }: ArtworkPageProps) {
  const user = await getSessionUser();
  const resolvedSearchParams = (await searchParams) ?? {};
  const showTrendingRail = !hasActiveArtworkFilters(resolvedSearchParams);
  const trending = showTrendingRail ? await getTrendingArtworks30({ limit: 12 }) : [];

  const mediumGroups = await db.artwork.groupBy({
    by: ["medium"],
    where: { isPublished: true, deletedAt: null, medium: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });

  const mediumOptions = mediumGroups
    .filter((row): row is typeof row & { medium: string } => Boolean(row.medium))
    .map((row) => ({ name: row.medium, count: row._count.id }));

  const savedSearches = user
    ? await db.savedSearch.findMany({
        where: { userId: user.id, type: "ARTWORK" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, name: true, paramsJson: true },
      })
    : [];

  return (
    <PageShell className="page-stack">
      <PageHeader title="Artwork" subtitle="Browse published works from artists across Artio." />
      <CuratedCollectionsRail surface="artwork" />
      {showTrendingRail ? <TrendingRail items={trending} /> : null}
      <ArtworkBrowser
        signedIn={Boolean(user)}
        mediumOptions={mediumOptions}
        savedSearches={savedSearches.map((search) => ({
          id: search.id,
          name: search.name,
          params: (search.paramsJson ?? {}) as Record<string, unknown>,
        }))}
      />
    </PageShell>
  );
}
