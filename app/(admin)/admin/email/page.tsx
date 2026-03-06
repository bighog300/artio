import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import CampaignListClient from "./campaign-list-client";

export default async function AdminCampaignListPage() {
  await requireAdmin();

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader
        title="Email Campaigns"
        description="Create, send, and monitor broadcast campaigns."
        backHref="/admin"
        backLabel="Back to Admin"
      />
      <CampaignListClient />
    </main>
  );
}
