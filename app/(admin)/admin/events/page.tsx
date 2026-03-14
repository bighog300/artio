import { requireAdmin } from "@/lib/admin";
import { AdminEntityManagerClient } from "../admin-entity-manager-client";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminEvents() {
  await requireAdmin({ redirectOnFail: true });
  return (
    <main className="space-y-6">
      <AdminPageHeader title="Events" description="Manage events across the platform." />
      <AdminEntityManagerClient
        entity="events"
        title="Manage Events"
        fields={["title", "startAt", "endAt", "venueId", "ticketUrl", "isPublished"]}
        defaultMatchBy="id"
      />
    </main>
  );
}
