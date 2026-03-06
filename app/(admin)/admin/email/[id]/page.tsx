import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import CampaignEditorClient from "../campaign-editor-client";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader title="Edit Email Campaign" description="Update campaign copy, audience, and schedule." backHref="/admin/email" backLabel="Back to Campaigns" />
      <CampaignEditorClient campaignId={id} />
    </main>
  );
}
