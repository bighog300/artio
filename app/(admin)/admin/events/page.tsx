import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { computeEventPublishBlockers } from "@/lib/publish-readiness";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";
import { BulkPublishEventsClient } from "./bulk-publish-client";

export const dynamic = "force-dynamic";

export default async function AdminEvents() {
  await requireAdmin({ redirectOnFail: true });

  const approvedEvents = await db.event.findMany({
    where: { status: "APPROVED", deletedAt: null },
    select: {
      id: true,
      startAt: true,
      timezone: true,
      venue: { select: { status: true, isPublished: true } },
      _count: { select: { images: true } },
    },
    orderBy: { startAt: "asc" },
    take: 100,
  });

  const publishableIds = approvedEvents
    .filter((e) => computeEventPublishBlockers({
      startAt: e.startAt,
      timezone: e.timezone,
      venue: e.venue,
      hasImage: e._count.images > 0,
    }).length === 0)
    .map((e) => e.id);

  return (
    <main className="space-y-6">
      <AdminPageHeader
        title="Events"
        description="Manage events across the platform."
        right={(
          <Link
            href="/admin/events/new"
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            New event
          </Link>
        )}
      />
      <BulkPublishEventsClient approvedIds={publishableIds} />
      <AdminEntityManagerClient
        entity="events"
        title="Manage Events"
        fields={["title", "startAt", "endAt", "venueName", "artistNames", "isAiExtracted", "ticketUrl", "isPublished"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
