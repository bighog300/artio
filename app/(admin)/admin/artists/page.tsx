import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import PendingIngestBanner from "@/components/admin/PendingIngestBanner";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminArtists() {
  await requireAdmin({ redirectOnFail: true });

  const [pendingBands, highCandidates] = await Promise.all([
    db.ingestExtractedArtist.groupBy({
      by: ["confidenceBand"],
      where: { status: "PENDING" },
      _count: { id: true },
    }),
    db.ingestExtractedArtist.findMany({
      where: { status: "PENDING", confidenceBand: "HIGH" },
      select: { id: true },
      orderBy: { confidenceScore: "desc" },
      take: 50,
    }),
  ]);

  const high = pendingBands.find((b) => b.confidenceBand === "HIGH")?._count.id ?? 0;
  const medium = pendingBands.find((b) => b.confidenceBand === "MEDIUM")?._count.id ?? 0;
  const low = pendingBands.find((b) => b.confidenceBand === "LOW")?._count.id ?? 0;
  const total = high + medium + low;
  const highIds = highCandidates.map((c) => c.id);

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artists" description="Manage artist profiles and publishing metadata." />
      <PendingIngestBanner
        entity="artists"
        total={total}
        high={high}
        medium={medium}
        low={low}
        highIds={highIds}
      />
      <AdminEntityManagerClient
        entity="artists"
        title="Manage Artists"
        fields={["name", "websiteUrl", "bio"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
