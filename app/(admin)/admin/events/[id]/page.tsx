import { notFound } from "next/navigation";
import EventAdminForm from "@/app/(admin)/admin/_components/EventAdminForm";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import AdminApproveButton from "@/app/(admin)/admin/_components/AdminApproveButton";

export default async function AdminEditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: { eventTags: { include: { tag: true } }, eventArtists: { include: { artist: true } } },
  });
  if (!event) notFound();

  const pendingSubmission = await db.submission.findFirst({
    where: { targetEventId: id, status: "SUBMITTED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit event" backHref="/admin/events" backLabel="Back to events" />
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
      <section className="rounded border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm text-emerald-900">Moderation action</p>
        <p className="text-sm text-emerald-800">Approve this event from here when it is ready.</p>
        <div className="mt-3">
          <AdminApproveButton entityType="event" submissionId={pendingSubmission?.id ?? null} disabled={!pendingSubmission} />
        </div>
      </section>
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
