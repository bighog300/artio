import { notFound } from "next/navigation";
import AdminEntityForm from "@/app/(admin)/admin/_components/AdminEntityForm";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import AdminApproveButton from "@/app/(admin)/admin/_components/AdminApproveButton";

export default async function AdminVenue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await db.venue.findUnique({ where: { id } });
  if (!venue) notFound();

  const pendingSubmission = await db.submission.findFirst({
    where: { targetVenueId: id, status: "IN_REVIEW" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit venue" backHref="/admin/venues" backLabel="Back to venues" />
      <AdminEntityForm
        title="Edit Venue"
        endpoint={`/api/admin/venues/${id}`}
        method="PATCH"
        redirectPath="/admin/venues"
        uploadTargetType="venue"
        uploadTargetId={id}
        initial={venue}
        fields={[
          { name: "name", label: "Name" },
          { name: "slug", label: "Slug" },
          { name: "description", label: "Description" },
          { name: "addressLine1", label: "Address Line 1" },
          { name: "addressLine2", label: "Address Line 2" },
          { name: "city", label: "City" },
          { name: "region", label: "Region" },
          { name: "postcode", label: "Postcode" },
          { name: "country", label: "Country" },
          { name: "lat", label: "Latitude" },
          { name: "lng", label: "Longitude" },
          { name: "timezone", label: "Timezone (IANA)" },
          { name: "websiteUrl", label: "Website URL" },
          { name: "instagramUrl", label: "Instagram URL" },
          { name: "contactEmail", label: "Contact Email" },
          { name: "featuredImageUrl", label: "Featured Image URL" },
          { name: "featuredAssetId", label: "Featured Asset ID" },
        ]}
        altRequired={ADMIN_IMAGE_ALT_REQUIRED}
      />
      <section className="rounded border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm text-emerald-900">Moderation action</p>
        <p className="text-sm text-emerald-800">Approve this venue from here when it is ready.</p>
        <div className="mt-3">
          <AdminApproveButton
            entityType="venue"
            entityId={venue.id}
            submissionId={pendingSubmission?.id ?? null}
            directStatusEndpoint={`/api/admin/venues/${venue.id}`}
            disabled={venue.status === "PUBLISHED"}
          />
        </div>
      </section>
      <section className="rounded-lg border border-destructive/30 bg-card p-4">
        <h2 className="text-base font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Archive or restore first. Permanent delete is irreversible.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AdminArchiveActions entity="venues" id={venue.id} archived={!!venue.deletedAt} />
        </div>
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">Hard delete permanently removes this venue and related data.</p>
          <AdminHardDeleteButton entityLabel="Venue" entityId={venue.id} deleteUrl={`/api/admin/venues/${venue.id}`} redirectTo="/admin/venues" />
        </div>
      </section>
    </main>
  );
}
