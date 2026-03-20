import { notFound } from "next/navigation";
import AdminEntityForm from "@/app/(admin)/admin/_components/AdminEntityForm";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import ModerationPanel from "@/app/(admin)/admin/_components/ModerationPanel";
import { computeVenuePublishBlockers } from "@/lib/publish-readiness";
import VenueImagePicker from "@/app/(admin)/admin/venues/[id]/venue-image-picker";
import VenueEnrichmentLogPanel from "@/components/admin/venue-enrichment-log-panel";
import { DetectEventsPageButton } from "@/app/(admin)/admin/venues/[id]/detect-events-page-button";

export default async function AdminVenue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [venue, venueImages, ingestCandidates, homepageCandidates] = await Promise.all([
    db.venue.findUnique({ where: { id } }),
    db.venueImage.findMany({
      where: { venueId: id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true, width: true, height: true },
    }),
    db.ingestExtractedEvent.findMany({
      where: {
        venueId: id,
        status: { in: ["PENDING", "APPROVED"] },
        OR: [{ imageUrl: { not: null } }, { blobImageUrl: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, imageUrl: true, blobImageUrl: true, title: true, run: { select: { id: true } } },
    }),
    db.venueHomepageImageCandidate.findMany({
      where: { venueId: id, status: "pending" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, url: true, source: true, sortOrder: true, status: true },
    }),
  ]);
  if (!venue) notFound();

  const ingestSuggestions = Array.from(
    ingestCandidates.reduce((acc, s) => {
      const displayUrl = s.blobImageUrl ?? s.imageUrl;
      if (!displayUrl || !s.imageUrl || acc.has(displayUrl)) return acc;
      acc.set(displayUrl, {
        candidateId: s.id,
        runId: s.run.id,
        displayUrl,
        originalUrl: s.imageUrl,
        title: s.title,
      });
      return acc;
    }, new Map<string, { candidateId: string; runId: string; displayUrl: string; originalUrl: string; title: string }>()).values(),
  ).slice(0, 12);

  const blockers = computeVenuePublishBlockers(venue);

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
          { name: "eventsPageUrl", label: "Events Page URL (overrides website URL for ingest)" },
          { name: "instagramUrl", label: "Instagram URL" },
          { name: "contactEmail", label: "Contact Email" },
        ]}
        altRequired={ADMIN_IMAGE_ALT_REQUIRED}
      />
      <DetectEventsPageButton
        venueId={id}
        initialUrl={venue?.eventsPageUrl ?? null}
      />
      <VenueImagePicker
        venueId={id}
        images={venueImages}
        suggestions={ingestSuggestions}
        initialHomepageCandidates={homepageCandidates}
      />
      <ModerationPanel resource="venues" id={venue.id} status={venue.status} blockers={blockers.map((item) => item.message)} />
      <VenueEnrichmentLogPanel venueId={venue.id} />
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
