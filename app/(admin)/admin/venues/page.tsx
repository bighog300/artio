import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import VenueIngestStatusPanel from "@/components/admin/VenueIngestStatusPanel";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminVenues() {
  await requireAdmin({ redirectOnFail: true });
  const venues = await db.venue.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 500,
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader
        title="Venues"
        description="Manage venue records and publishing metadata."
        right={(
          <Link
            href="/admin/venues/new"
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            New venue
          </Link>
        )}
      />
      <VenueIngestStatusPanel venues={venues} />
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
