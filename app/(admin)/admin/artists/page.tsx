import { requireAdmin } from "@/lib/admin";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminArtists() {
  await requireAdmin({ redirectOnFail: true });
  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artists" description="Manage artist profiles and publishing metadata." />
      <AdminEntityManagerClient
        entity="artists"
        title="Manage Artists"
        fields={["name", "websiteUrl", "bio", "featuredAssetId", "isPublished"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
