import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ArtworksClient from "@/app/(admin)/admin/ingest/artworks/artworks-client";
import { BackfillArtworksTrigger } from "@/app/(admin)/admin/ingest/artworks/backfill-trigger";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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
      createdArtworkId: true,
      lastApprovalAttemptAt: true,
      lastApprovalError: true,
      imageImportStatus: true,
      imageImportWarning: true,
      createdAt: true,
      sourceEvent: { select: { id: true, title: true, slug: true } },
      createdArtwork: {
        select: {
          id: true,
          artistId: true,
          artist: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
    },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const artistNames = [
    ...new Set(
      candidates
        .map((candidate) => candidate.artistName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  const [existingArtists, pendingCandidates] = await Promise.all([
    artistNames.length
      ? db.artist.findMany({
          where: {
            OR: artistNames.map((name) => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
            deletedAt: null,
          },
          select: { name: true, slug: true, status: true },
        })
      : Promise.resolve([]),
    artistNames.length
      ? db.ingestExtractedArtist.findMany({
          where: {
            normalizedName: {
              in: artistNames.map((name) => name.toLowerCase().trim()),
            },
            status: "PENDING",
          },
          select: {
            name: true,
            normalizedName: true,
            confidenceBand: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const existingArtistByName = new Map(
    existingArtists.map((artist) => [artist.name.toLowerCase(), artist]),
  );
  const pendingCandidateByName = new Map(
    pendingCandidates.map((candidate) => [candidate.normalizedName, candidate]),
  );

  const annotatedCandidates = candidates.map((candidate) => ({
    ...candidate,
    artistStatus: candidate.artistName
      ? existingArtistByName.has(candidate.artistName.toLowerCase())
        ? ("exists" as const)
        : pendingCandidateByName.has(candidate.artistName.toLowerCase().trim())
          ? ("pending" as const)
          : ("stub" as const)
      : null,
  }));

  return (
    <>
      <AdminPageHeader
        title="Artwork Extraction Queue"
        description="Pending AI-extracted artwork candidates awaiting moderation."
      />
      <BackfillArtworksTrigger />
      <ArtworksClient candidates={annotatedCandidates} userRole={user?.role} />
    </>
  );
}
