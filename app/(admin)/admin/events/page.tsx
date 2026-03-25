import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { computeEventPublishBlockers } from "@/lib/publish-readiness";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";
import { BulkPublishEventsClient } from "./bulk-publish-client";
import { BackfillEventImagesTrigger } from "./backfill-images-trigger";

export const dynamic = "force-dynamic";

export default async function AdminEvents() {
  await requireAdmin({ redirectOnFail: true });

  const [approvedEvents, statusCounts] = await Promise.all([
    db.event.findMany({
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
    }),
    db.event.groupBy({
      by: ["status"],
      where: {
        deletedAt: null,
        status: { in: ["IN_REVIEW", "APPROVED", "DRAFT"] },
      },
      _count: { id: true },
    }),
  ]);

  const inReview =
    statusCounts.find((s) => s.status === "IN_REVIEW")?._count.id ?? 0;
  const approved =
    statusCounts.find((s) => s.status === "APPROVED")?._count.id ?? 0;
  const draft =
    statusCounts.find((s) => s.status === "DRAFT")?._count.id ?? 0;
  const needsAttention = inReview + approved;

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
      {needsAttention > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {needsAttention} event{needsAttention === 1 ? "" : "s"} need attention
          </p>
          <p className="text-xs text-amber-800/70 dark:text-amber-300/70">
            {inReview > 0 ? `${inReview} in review` : ""}
            {inReview > 0 && approved > 0 ? " · " : ""}
            {approved > 0 ? `${approved} approved (ready to publish)` : ""}
            {draft > 0 ? ` · ${draft} draft` : ""}
          </p>
        </div>
      ) : null}

      <BulkPublishEventsClient approvedIds={publishableIds} />
      <AdminEntityManagerClient
        entity="events"
        title="Manage Events"
        fields={["title", "startAt", "endAt", "venueName", "artistNames", "ticketUrl"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
