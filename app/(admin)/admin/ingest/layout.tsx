import { redirect } from "next/navigation";
import IngestShellClient from "@/app/(admin)/admin/ingest/_components/ingest-shell-client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminIngestLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin");
  }

  const [bandCounts, failedLast24h, pendingArtists] = await Promise.all([
    db.ingestExtractedEvent.groupBy({
      by: ["confidenceBand"],
      where: { status: "PENDING", duplicateOfId: null },
      _count: { id: true },
    }),
    db.ingestRun.count({
      where: {
        status: "FAILED",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    db.ingestExtractedArtist.count({ where: { status: "PENDING" } }),
  ]);

  const high = bandCounts.find((band) => band.confidenceBand === "HIGH")?._count.id ?? 0;
  const medium = bandCounts.find((band) => band.confidenceBand === "MEDIUM")?._count.id ?? 0;
  const low = bandCounts.find((band) => band.confidenceBand === "LOW")?._count.id ?? 0;
  const total = high + medium + low;

  return (
    <IngestShellClient stats={{ high, medium, low, total, failedLast24h, pendingArtists }}>
      {children}
    </IngestShellClient>
  );
}
