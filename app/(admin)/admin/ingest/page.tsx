import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestEventQueueClient from "@/app/(admin)/admin/ingest/_components/ingest-event-queue-client";
import IngestTriggerClient from "@/app/(admin)/admin/ingest/_components/ingest-trigger-client";
import { db } from "@/lib/db";

export default async function AdminIngestPage() {
  const [candidates, venues] = await Promise.all([
    db.ingestExtractedEvent.findMany({
      where: {
        status: "PENDING",
        duplicateOfId: null,
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        blobImageUrl: true,
        startAt: true,
        locationText: true,
        confidenceScore: true,
        confidenceBand: true,
        confidenceReasons: true,
        status: true,
        rejectionReason: true,
        createdEventId: true,
        venue: { select: { id: true, name: true } },
        run: { select: { id: true, sourceUrl: true } },
      },
      orderBy: [{ confidenceScore: "desc" }, { startAt: "asc" }, { id: "asc" }],
      take: 100,
    }),
    db.venue.findMany({
      where: { websiteUrl: { not: null }, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, websiteUrl: true },
      take: 200,
    }),
  ]);

  const venueOptions = venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    websiteUrl: venue.websiteUrl ?? "",
  }));

  return (
    <>
      <AdminPageHeader
        title="Ingest"
        description="All pending extracted event candidates across venues, ordered by confidence. Recent Runs are available in the Runs tab."
      />
      <IngestTriggerClient venues={venueOptions} />
      <IngestEventQueueClient candidates={candidates} venues={venueOptions} />
    </>
  );
}
