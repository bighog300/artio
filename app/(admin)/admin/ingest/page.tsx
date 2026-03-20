import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestEventQueueClient from "@/app/(admin)/admin/ingest/_components/ingest-event-queue-client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function AdminIngestPage() {
  const user = await getSessionUser();

  const candidates = await db.ingestExtractedEvent.findMany({
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
    });

  return (
    <>
      <AdminPageHeader
        title="Ingest"
        description="Pending extracted event candidates, ordered by confidence. Use the Runs tab to trigger a manual extraction."
      />
      <IngestEventQueueClient candidates={candidates} userRole={user?.role} />
    </>
  );
}
