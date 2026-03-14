import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import AdminPageHeader from "../_components/AdminPageHeader";
import AdminArtworkListClient from "./admin-artwork-list-client";

export const dynamic = "force-dynamic";

export default async function AdminArtworkPage() {
  await requireAdmin({ redirectOnFail: true });

  const pricedCount = await db.artwork.count({
    where: { priceAmount: { not: null }, isPublished: true, deletedAt: null },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artwork" description="Manage, archive, and delete artworks." />
      <AdminArtworkListClient pricedCount={pricedCount} />
    </main>
  );
}
