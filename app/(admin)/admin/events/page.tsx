import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminEvents() {
  await requireAdmin({ redirectOnFail: true });
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
      <AdminEntityManagerClient
        entity="events"
        title="Manage Events"
        fields={["title", "startAt", "endAt", "venueName", "artistNames", "isAiExtracted", "ticketUrl", "isPublished"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
