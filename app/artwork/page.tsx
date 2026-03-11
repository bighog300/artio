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
  const distinctMediums = await db.artwork.findMany({
    where: { isPublished: true, deletedAt: null, medium: { not: null } },
    select: { medium: true },
    distinct: ["medium"],
    orderBy: { medium: "asc" },
    take: 50,
  });
  const mediumOptions = distinctMediums
    .map((row) => row.medium)
    .filter((m): m is string => Boolean(m));

  return (
    <PageShell className="page-stack">
      <PageHeader title="Artwork" subtitle="Browse published works from artists across Artio." />
      <CuratedCollectionsRail surface="artwork" />
      {showTrendingRail ? <TrendingRail items={trending} /> : null}
      <ArtworkBrowser signedIn={Boolean(user)} mediumOptions={mediumOptions} />
    </PageShell>
  );
}
