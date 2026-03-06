import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import CampaignEditorClient from "../campaign-editor-client";

export default async function NewCampaignPage() {
  await requireAdmin();

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader title="New Email Campaign" description="Compose and send a new broadcast." backHref="/admin/email" backLabel="Back to Campaigns" />
      <CampaignEditorClient />
    </main>
  );
}
