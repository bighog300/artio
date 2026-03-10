import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import SettingsShell from "./settings-shell";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Settings" description="Configure platform-wide settings." />
      <SettingsShell initial={{
        ingestSystemPrompt: settings.ingestSystemPrompt ?? null,
        ingestModel: settings.ingestModel ?? null,
        ingestMaxOutputTokens: settings.ingestMaxOutputTokens ?? null,
        emailEnabled: settings.emailEnabled ?? false,
        emailFromAddress: settings.emailFromAddress ?? null,
        resendApiKey: settings.resendApiKey ?? null,
        resendFromAddress: settings.resendFromAddress ?? null,
        stripePublishableKey: settings.stripePublishableKey ?? null,
        stripeSecretKeySet: Boolean(settings.stripeSecretKey),
        stripeWebhookSecretSet: Boolean(settings.stripeWebhookSecret),
        platformFeePercent: settings.platformFeePercent,
        emailOutboxBatchSize: settings.emailOutboxBatchSize ?? null,
        analyticsSalt: settings.analyticsSalt,
        openAiApiKeySet: Boolean(settings.openAiApiKey),
        geminiApiKeySet: Boolean(settings.geminiApiKey),
        anthropicApiKeySet: Boolean(settings.anthropicApiKey),
        eventExtractionProvider: settings.eventExtractionProvider,
        artworkExtractionProvider: settings.artworkExtractionProvider,
        artistLookupProvider: settings.artistLookupProvider,
        artistBioProvider: settings.artistBioProvider,
        ingestEnabled: settings.ingestEnabled,
        ingestImageEnabled: settings.ingestImageEnabled,
        ingestMaxCandidatesPerVenueRun: settings.ingestMaxCandidatesPerVenueRun,
        ingestDuplicateSimilarityThreshold: settings.ingestDuplicateSimilarityThreshold,
        ingestDuplicateLookbackDays: settings.ingestDuplicateLookbackDays,
        ingestConfidenceHighMin: settings.ingestConfidenceHighMin,
        ingestConfidenceMediumMin: settings.ingestConfidenceMediumMin,
        venueGenerationModel: settings.venueGenerationModel,
        venueAutoPublish: settings.venueAutoPublish,
        editorialNotifyTo: settings.editorialNotifyTo,
        editorialNotificationsWebhookUrl: settings.editorialNotificationsWebhookUrl,
        editorialNotificationsEmailEnabled: settings.editorialNotificationsEmailEnabled,
        alertWebhookUrl: settings.alertWebhookUrl,
        alertWebhookSecretSet: Boolean(settings.alertWebhookSecret),
        googleIndexingEnabled: settings.googleIndexingEnabled,
        googleServiceAccountJsonSet: Boolean(settings.googleServiceAccountJson),
      }} />
    </div>
  );
}
