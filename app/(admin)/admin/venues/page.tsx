import { requireAdmin } from "@/lib/admin";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminVenues() {
  await requireAdmin({ redirectOnFail: true });
  return (
    <main className="space-y-6">
      <AdminPageHeader title="Venues" description="Manage venue records and publishing metadata." />
      <AdminEntityManagerClient
        entity="venues"
        title="Manage Venues"
        fields={[
          "name",
          "slug",
          "addressLine1",
          "addressLine2",
          "city",
          "postcode",
          "country",
          "lat",
          "lng",
          "websiteUrl",
          "eventsPageUrl",
          "isPublished",
          "description",
          "featuredAssetId",
        ]}
        defaultMatchBy="slug"
      />
    </main>
  );
}
