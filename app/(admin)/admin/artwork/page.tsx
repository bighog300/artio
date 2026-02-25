import { requireAdmin } from "@/lib/admin";
import AdminPageHeader from "../_components/AdminPageHeader";
import AdminArtworkListClient from "./admin-artwork-list-client";

export const dynamic = "force-dynamic";

export default async function AdminArtworkPage() {
  await requireAdmin();

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artwork" description="Manage, archive, and delete artworks." />
      <AdminArtworkListClient />
    </main>
  );
}
