import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ArtistsClient from "@/app/(admin)/admin/ingest/artists/artists-client";
import { BackfillArtistsTrigger } from "@/app/(admin)/admin/ingest/artists/backfill-trigger";
import { buildArtistQueueWhere, getQueueOrderBy, parseQueueQueryParams } from "@/lib/admin-ingest-queue-query";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function toURLSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  return params;
}

export default async function AdminIngestArtistsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const user = await getSessionUser();
  const resolvedParams = await searchParams;
  const query = parseQueueQueryParams(toURLSearchParams(resolvedParams));

  const candidates = await db.ingestExtractedArtist.findMany({
    where: buildArtistQueueWhere(query),
    select: {
      id: true,
      name: true,
      bio: true,
      mediums: true,
      collections: true,
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
    orderBy: getQueueOrderBy(query.sort),
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
      <ArtistsClient
        candidates={hydratedCandidates}
        userRole={user?.role}
        initialApprovalFilter={query.approval}
        initialImageFilter={query.image}
        initialReasonCodeFilter={query.reason}
        initialSort={query.sort}
      />
    </>
  );
}
