import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import PendingIngestBanner from "@/components/admin/PendingIngestBanner";
import AdminPageHeader from "../_components/AdminPageHeader";
import AdminArtworkListClient from "./admin-artwork-list-client";

export const dynamic = "force-dynamic";

export default async function AdminArtworkPage() {
  await requireAdmin({ redirectOnFail: true });

  const [pricedCount, pendingBands, highCandidates] = await Promise.all([
    db.artwork.count({
      where: { priceAmount: { not: null }, isPublished: true, deletedAt: null },
    }),
    db.ingestExtractedArtwork.groupBy({
      by: ["confidenceBand"],
      where: { status: "PENDING" },
      _count: { id: true },
    }),
    db.ingestExtractedArtwork.findMany({
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
      <AdminPageHeader title="Artwork" description="Manage, archive, and delete artworks." />
      <PendingIngestBanner
        entity="artworks"
        total={total}
        high={high}
        medium={medium}
        low={low}
        highIds={highIds}
      />
      <AdminArtworkListClient pricedCount={pricedCount} />
    </main>
  );
}
