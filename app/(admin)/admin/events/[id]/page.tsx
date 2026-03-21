import { notFound } from "next/navigation";
import EventAdminForm from "@/app/(admin)/admin/_components/EventAdminForm";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import ModerationPanel from "@/app/(admin)/admin/_components/ModerationPanel";
import { computeEventPublishBlockers } from "@/lib/publish-readiness";
import { ImageReplacePanel } from "@/components/admin/ImageReplacePanel";

export default async function AdminEditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: { eventTags: { include: { tag: true } }, eventArtists: { include: { artist: true } }, venue: { select: { status: true, isPublished: true } }, images: { select: { id: true, url: true }, orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  if (!event) notFound();

  const blockers = computeEventPublishBlockers({ startAt: event.startAt, timezone: event.timezone, venue: event.venue, hasImage: event.images.length > 0 });
  const currentImageUrl = event.images[0]?.url ?? null;

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit event" backHref="/admin/events" backLabel="Back to events" />
      {blockers.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            This event cannot be published yet
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-800/80 dark:text-amber-300/80">
            {blockers.map((blocker) => (
              <li key={blocker.id}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <EventAdminForm
        title="Edit Event"
        endpoint={`/api/admin/events/${id}`}
        method="PATCH"
        eventId={event.id}
        initial={{
          title: event.title,
          slug: event.slug,
          description: event.description,
          timezone: event.timezone,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString(),
          venueId: event.venueId,
          tagSlugs: event.eventTags.map((x) => x.tag.slug),
          artistSlugs: event.eventArtists.map((x) => x.artist.slug),
          isPublished: event.isPublished,
        }}
        altRequired={ADMIN_IMAGE_ALT_REQUIRED}
      />
      <ImageReplacePanel
        endpoint={`/api/admin/events/${id}/image`}
        label="event"
        currentImageUrl={currentImageUrl}
      />
      <ModerationPanel resource="events" id={event.id} status={event.status} blockers={blockers.map((item) => item.message)} />
      <section className="rounded-lg border border-destructive/30 bg-card p-4">
        <h2 className="text-base font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Archive or restore first. Permanent delete is irreversible.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AdminArchiveActions entity="events" id={event.id} archived={!!event.deletedAt} />
        </div>
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">Hard delete permanently removes this event and related data.</p>
          <AdminHardDeleteButton entityLabel="Event" entityId={event.id} deleteUrl={`/api/admin/events/${event.id}`} redirectTo="/admin/events" />
        </div>
      </section>
    </main>
  );
}
