import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/auth";
import { getCronStatusSnapshot } from "@/lib/cron-state";
import { db } from "@/lib/db";
import LogsClient from "./logs-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminIngestLogsPage() {
  await requireAdmin();

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [cronState, recentRunFailures, recentCandidateRejections, recentArtistArtworkPipeline] = await Promise.all([
    getCronStatusSnapshot().catch(() => ({})),
    db.ingestRun.findMany({
      where: { status: "FAILED", createdAt: { gte: since7d } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        status: true,
        sourceUrl: true,
        errorCode: true,
        errorMessage: true,
        errorDetail: true,
        durationMs: true,
        venue: { select: { id: true, name: true } },
      },
    }),
    db.ingestExtractedEvent.findMany({
      where: { status: "REJECTED", createdAt: { gte: since7d } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        status: true,
        confidenceScore: true,
        confidenceBand: true,
        rejectionReason: true,
        venue: { select: { id: true, name: true } },
        run: { select: { id: true } },
      },
    }),
    (async () => {
      const statusFilter: Array<"PENDING" | "APPROVED" | "REJECTED"> = ["PENDING", "APPROVED", "REJECTED"];
      const relevanceWhere = {
        OR: [
          { lastApprovalError: { not: null } },
          { imageImportStatus: { not: null } },
          { imageImportWarning: { not: null } },
          { updatedAt: { gte: since7d } },
        ],
      };

      const [artists, artworks] = await Promise.all([
        db.ingestExtractedArtist.findMany({
          where: {
            status: { in: statusFilter },
            ...relevanceWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: 80,
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
            lastApprovalAttemptAt: true,
            lastApprovalError: true,
            imageImportStatus: true,
            imageImportWarning: true,
          },
        }),
        db.ingestExtractedArtwork.findMany({
          where: {
            status: { in: statusFilter },
            ...relevanceWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: 80,
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            lastApprovalAttemptAt: true,
            lastApprovalError: true,
            imageImportStatus: true,
            imageImportWarning: true,
            sourceEventId: true,
          },
        }),
      ]);
      const [artistEvents, artworkEvents] = await Promise.all([
        db.ingestExtractedArtistEvent.findMany({
          where: { artistCandidateId: { in: artists.map((artist) => artist.id) } },
          orderBy: { createdAt: "desc" },
          select: {
            artistCandidateId: true,
            event: { select: { id: true, title: true } },
          },
          take: 200,
        }),
        db.event.findMany({
          where: { id: { in: artworks.map((artwork) => artwork.sourceEventId) } },
          select: { id: true, title: true },
        }),
      ]);

      const artistEventsByCandidateId = new Map<string, Array<{ id: string; title: string }>>();
      for (const link of artistEvents) {
        const current = artistEventsByCandidateId.get(link.artistCandidateId) ?? [];
        if (current.length < 2) current.push(link.event);
        artistEventsByCandidateId.set(link.artistCandidateId, current);
      }

      const artworkEventById = new Map(artworkEvents.map((event) => [event.id, event]));

      return [
        ...artists.map((artist) => ({
          type: "artist" as const,
          id: artist.id,
          displayName: artist.name,
          status: artist.status,
          updatedAt: artist.updatedAt.toISOString(),
          lastApprovalAttemptAt: artist.lastApprovalAttemptAt?.toISOString() ?? null,
          lastApprovalError: artist.lastApprovalError,
          imageImportStatus: artist.imageImportStatus,
          imageImportWarning: artist.imageImportWarning,
          relatedEvents: artistEventsByCandidateId.get(artist.id) ?? [],
        })),
        ...artworks.map((artwork) => ({
          type: "artwork" as const,
          id: artwork.id,
          displayName: artwork.title,
          status: artwork.status,
          updatedAt: artwork.updatedAt.toISOString(),
          lastApprovalAttemptAt: artwork.lastApprovalAttemptAt?.toISOString() ?? null,
          lastApprovalError: artwork.lastApprovalError,
          imageImportStatus: artwork.imageImportStatus,
          imageImportWarning: artwork.imageImportWarning,
          relatedEvents: artworkEventById.get(artwork.sourceEventId) ? [artworkEventById.get(artwork.sourceEventId)!] : [],
        })),
      ]
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .slice(0, 100);
    })(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Ingest Logs"
        description="Cron run outcomes, extraction failures, and candidate rejections for the last 7 days."
      />
      <LogsClient
        cronState={cronState}
        initialRunFailures={recentRunFailures.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))}
        initialCandidateRejections={recentCandidateRejections.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        }))}
        initialArtistArtworkPipeline={recentArtistArtworkPipeline}
      />
    </>
  );
}
