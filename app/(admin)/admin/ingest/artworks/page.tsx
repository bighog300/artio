import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ArtworksClient from "@/app/(admin)/admin/ingest/artworks/artworks-client";
import { BackfillArtworksTrigger } from "@/app/(admin)/admin/ingest/artworks/backfill-trigger";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminIngestArtworksPage() {
  await requireAdmin();
  const user = await getSessionUser();

  const candidates = await db.ingestExtractedArtwork.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      title: true,
      medium: true,
      year: true,
      dimensions: true,
      description: true,
      imageUrl: true,
      artistName: true,
      sourceUrl: true,
      status: true,
      confidenceScore: true,
      confidenceBand: true,
      confidenceReasons: true,
      extractionProvider: true,
      createdAt: true,
      sourceEvent: { select: { id: true, title: true, slug: true } },
    },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <>
      <AdminPageHeader
        title="Artwork Extraction Queue"
        description="Pending AI-extracted artwork candidates awaiting moderation."
      />
      <BackfillArtworksTrigger />
      <ArtworksClient candidates={candidates} userRole={user?.role} />
    </>
  );
}
