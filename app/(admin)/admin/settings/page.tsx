import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import SettingsShell from "./settings-shell";

export default async function AdminSettingsPage() {
  await requireAdmin({ redirectOnFail: true });
  const settings = await getSiteSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Settings" description="Configure platform-wide settings." />
      <SettingsShell initial={{
        ingestSystemPrompt: settings.ingestSystemPrompt ?? null,
        artworkExtractionSystemPrompt: settings.artworkExtractionSystemPrompt ?? null,
        artistBioSystemPrompt: settings.artistBioSystemPrompt ?? null,
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
        googlePseApiKeySet: Boolean(settings.googlePseApiKey),
        braveSearchApiKeySet: Boolean(settings.braveSearchApiKey),
        googlePseCx: settings.googlePseCx ?? null,
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
        regionAutoPublishVenues: settings.regionAutoPublishVenues,
        regionAutoPublishEvents: settings.regionAutoPublishEvents,
        regionAutoPublishArtists: settings.regionAutoPublishArtists,
        regionAutoPublishArtworks: settings.regionAutoPublishArtworks,
        regionDiscoveryEnabled: settings.regionDiscoveryEnabled,
        regionMaxVenuesPerRun: settings.regionMaxVenuesPerRun,
        enrichMatchedArtists: settings.enrichMatchedArtists,
        autoTagEnabled: settings.autoTagEnabled ?? false,
        autoTagProvider: settings.autoTagProvider ?? null,
        autoTagModel: settings.autoTagModel ?? null,
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
