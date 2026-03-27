import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ArtistsClient from "@/app/(admin)/admin/ingest/artists/artists-client";
import { BackfillArtistsTrigger } from "@/app/(admin)/admin/ingest/artists/backfill-trigger";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminIngestArtistsPage() {
  await requireAdmin();
  const user = await getSessionUser();

  const candidates = await db.ingestExtractedArtist.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      name: true,
      bio: true,
      mediums: true,
      websiteUrl: true,
      instagramUrl: true,
      nationality: true,
      birthYear: true,
      sourceUrl: true,
      status: true,
      confidenceScore: true,
      confidenceBand: true,
      confidenceReasons: true,
      extractionProvider: true,
      createdArtistId: true,
      lastApprovalAttemptAt: true,
      lastApprovalError: true,
      imageImportStatus: true,
      imageImportWarning: true,
      createdAt: true,
      createdArtist: {
        select: {
          featuredAsset: {
            select: {
              url: true,
              originalUrl: true,
              processingStatus: true,
              processingError: true,
              variants: { select: { variantName: true, url: true } },
            },
          },
        },
      },
      eventLinks: {
        select: {
          eventId: true,
          event: {
            select: {
              title: true,
              slug: true,
              venue: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const hydratedCandidates = candidates.map((candidate) => ({
    ...candidate,
    image: resolveAssetDisplay({
      asset: candidate.createdArtist?.featuredAsset ?? null,
      requestedVariant: "thumb",
    }),
  }));

  return (
    <>
      <AdminPageHeader
        title="Artist Discovery Queue"
        description="Pending AI-discovered artist profile candidates awaiting moderation."
      />
      <BackfillArtistsTrigger />
      <ArtistsClient candidates={hydratedCandidates} userRole={user?.role} />
    </>
  );
}
