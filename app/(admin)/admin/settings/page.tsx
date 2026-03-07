import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import EmailSettingsClient from "./email-settings-client";
import IngestSettingsClient from "./ingest-settings-client";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Settings" description="Configure ingest extraction and email behaviour." />
      <IngestSettingsClient
        initial={{
          ingestSystemPrompt: settings.ingestSystemPrompt ?? null,
          ingestModel: settings.ingestModel ?? null,
          ingestMaxOutputTokens: settings.ingestMaxOutputTokens ?? null,
        }}
      />
      <EmailSettingsClient
        initial={{
          emailEnabled: settings.emailEnabled ?? false,
          emailFromAddress: settings.emailFromAddress ?? null,
          resendApiKey: settings.resendApiKey ?? null,
          resendFromAddress: settings.resendFromAddress ?? null,
          emailOutboxBatchSize: settings.emailOutboxBatchSize ?? null,
        }}
      />
    </div>
  );
}
