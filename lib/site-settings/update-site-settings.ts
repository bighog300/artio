import { db } from "@/lib/db";

const SITE_SETTINGS_ID = "default";

export async function updateSiteSettings(data: {
  ingestSystemPrompt?: string | null;
  ingestModel?: string | null;
  ingestMaxOutputTokens?: number | null;
  emailEnabled?: boolean;
  emailFromAddress?: string | null;
  resendApiKey?: string | null;
  resendFromAddress?: string | null;
  emailOutboxBatchSize?: number | null;
}) {
  return db.siteSettings.upsert({
    where: { id: SITE_SETTINGS_ID },
    create: { id: SITE_SETTINGS_ID, ...data },
    update: data,
  });
}
