import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import VenueIngestStatusPanel from "@/components/admin/VenueIngestStatusPanel";
import { db } from "@/lib/db";
import { computeVenueCompleteness } from "@/lib/venue-completeness";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminVenues() {
  await requireAdmin({ redirectOnFail: true });

  const venues = await db.venue.findMany({
    where: { deletedAt: null, isPublished: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      description: true,
      openingHours: true,
      contactEmail: true,
      instagramUrl: true,
      featuredAssetId: true,
      eventsPageUrl: true,
    },
    take: 500,
  });

  const venueScores = venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    ...computeVenueCompleteness(venue),
  }));

  const incompleteVenues = venueScores
    .filter((venue) => venue.score < 80)
    .sort((a, b) => a.score - b.score);

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

      {incompleteVenues.length > 0 ? (
        <section className="rounded-lg border bg-background p-4">
          <h2 className="mb-1 text-base font-semibold">Venue completeness</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {incompleteVenues.length} published venue
            {incompleteVenues.length === 1 ? "" : "s"} below 80% completeness.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Missing</th>
                </tr>
              </thead>
              <tbody>
                {incompleteVenues.slice(0, 20).map((venue) => (
                  <tr key={venue.id} className="border-b align-top">
                    <td className="px-3 py-2">
                      <Link href={`/admin/venues/${venue.id}`} className="underline">
                        {venue.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          venue.score >= 70
                            ? "font-medium text-amber-700 dark:text-amber-400"
                            : "font-medium text-destructive"
                        }
                      >
                        {venue.score}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {venue.missing.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border bg-background p-4">
          <p className="text-sm text-emerald-600">
            All published venues are at least 80% complete.
          </p>
        </section>
      )}

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
