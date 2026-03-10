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
  stripePublishableKey?: string | null;
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
  platformFeePercent?: number;
  emailOutboxBatchSize?: number | null;
  analyticsSalt?: string | null;
  openAiApiKey?: string | null;
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
  googlePseApiKey?: string | null;
  googlePseCx?: string | null;
  eventExtractionProvider?: "openai" | "gemini" | "claude" | null;
  venueEnrichmentProvider?: "openai" | "gemini" | "claude" | null;
  artistLookupProvider?: "openai" | "gemini" | "claude" | null;
  artistBioProvider?: "openai" | "gemini" | "claude" | null;
  artworkExtractionProvider?: "openai" | "gemini" | "claude" | null;
  ingestEnabled?: boolean;
  ingestMaxCandidatesPerVenueRun?: number | null;
  ingestDuplicateSimilarityThreshold?: number | null;
  ingestDuplicateLookbackDays?: number | null;
  ingestConfidenceHighMin?: number | null;
  ingestConfidenceMediumMin?: number | null;
  ingestImageEnabled?: boolean;
  venueGenerationModel?: string | null;
  venueAutoPublish?: boolean;
  editorialNotifyTo?: string | null;
  editorialNotificationsWebhookUrl?: string | null;
  editorialNotificationsEmailEnabled?: boolean;
  alertWebhookUrl?: string | null;
  alertWebhookSecret?: string | null;
  googleServiceAccountJson?: string | null;
  googleIndexingEnabled?: boolean;
}) {
  return db.siteSettings.upsert({
    where: { id: SITE_SETTINGS_ID },
    create: { id: SITE_SETTINGS_ID, ...data },
    update: data,
  });
}
