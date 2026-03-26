import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestEventQueueClient from "@/app/(admin)/admin/ingest/_components/ingest-event-queue-client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function buildDigestSummary({
  totalPending,
  high,
  failedLast24h,
}: {
  totalPending: number;
  high: number;
  failedLast24h: number;
}): string {
  const parts: string[] = [];

  if (totalPending === 0) {
    parts.push("Queue is clear.");
  } else {
    parts.push(`${totalPending} event${totalPending === 1 ? "" : "s"} pending.`);
    if (high > 0) {
      parts.push(`${high} HIGH confidence — ready to bulk approve.`);
    }
  }

  if (failedLast24h > 0) {
    parts.push(
      `${failedLast24h} run${failedLast24h === 1 ? "" : "s"} failed in the last 24h.`,
    );
  }

  return parts.join(" ");
}

export default async function AdminIngestPage() {
  const user = await getSessionUser();

  const [candidates, totalPending] = await Promise.all([
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
        description: true,
        artistNames: true,
        timezone: true,
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
    db.ingestExtractedEvent.count({
      where: {
        status: "PENDING",
        duplicateOfId: null,
      },
    }),
  ]);
  const venues = Array.from(
    new Map(candidates.map((c) => [c.venue.id, c.venue])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const high = candidates.filter(
    (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
  ).length;
  const digestSummary = buildDigestSummary({
    totalPending,
    high,
    failedLast24h: 0,
  });

  return (
    <>
      <AdminPageHeader
        title="Ingest"
        description="Pending extracted event candidates, ordered by confidence. Use the Runs tab to trigger a manual extraction."
      />
      <IngestEventQueueClient
        candidates={candidates}
        totalPending={totalPending}
        digestSummary={digestSummary}
        venues={venues}
        userRole={user?.role}
      />
    </>
  );
}
