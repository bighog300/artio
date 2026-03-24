import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ReadyToPublishClient from "@/app/(admin)/admin/ingest/ready-to-publish/ready-to-publish-client";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminReadyToPublishPage() {
  await requireAdmin();
  const user = await getSessionUser();

  const [artistResults, artworkResults] = await Promise.all([
    db.artist.findMany({
      where: { status: "IN_REVIEW", isAiDiscovered: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        mediums: true,
        websiteUrl: true,
        instagramUrl: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        _count: { select: { artworks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.artwork.findMany({
      where: { status: "IN_REVIEW", deletedAt: null, ingestCandidate: { isNot: null } },
      select: {
        id: true,
        title: true,
        slug: true,
        medium: true,
        year: true,
        description: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        artist: { select: { id: true, name: true, slug: true, status: true } },
        _count: { select: { images: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const artists = artistResults.map((artist) => ({
    ...artist,
    image: resolveAssetDisplay({ asset: artist.featuredAsset, requestedVariant: "thumb" }),
    nationality: null,
    birthYear: null,
  }));

  const artworks = artworkResults.map((artwork) => ({
    ...artwork,
    image: resolveAssetDisplay({ asset: artwork.featuredAsset, requestedVariant: "thumb" }),
    slug: artwork.slug ?? "",
  }));

  return (
    <>
      <AdminPageHeader
        title="Ready to publish"
        description="Approved AI-discovered artists and artworks waiting for final publication."
      />
      <ReadyToPublishClient artists={artists} artworks={artworks} userRole={user?.role} />
    </>
  );
}
