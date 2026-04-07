import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import SettingsShell from "./settings-shell";
import type { SiteSettingsShape } from "@/lib/site-settings/types";

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
        resendApiKeySet: Boolean(settings.resendApiKey),
        resendFromAddress: settings.resendFromAddress ?? null,
        stripePublishableKey: settings.stripePublishableKey ?? null,
        stripeSecretKeySet: Boolean(settings.stripeSecretKey),
        stripeWebhookSecretSet: Boolean(settings.stripeWebhookSecret),
        platformFeePercent: settings.platformFeePercent,
        emailOutboxBatchSize: settings.emailOutboxBatchSize ?? null,
        analyticsSalt: settings.analyticsSalt ?? null,
        openAiApiKeySet: Boolean(settings.openAiApiKey),
        geminiApiKeySet: Boolean(settings.geminiApiKey),
        anthropicApiKeySet: Boolean(settings.anthropicApiKey),
        googlePseApiKeySet: Boolean(settings.googlePseApiKey),
        braveSearchApiKeySet: Boolean(settings.braveSearchApiKey),
        googlePseCx: settings.googlePseCx ?? null,
        eventExtractionProvider: settings.eventExtractionProvider ?? null,
        artworkExtractionProvider: settings.artworkExtractionProvider ?? null,
        artistLookupProvider: settings.artistLookupProvider ?? null,
        artistBioProvider: settings.artistBioProvider ?? null,
        ingestEnabled: settings.ingestEnabled,
        ingestImageEnabled: settings.ingestImageEnabled,
        ingestMaxCandidatesPerVenueRun: settings.ingestMaxCandidatesPerVenueRun ?? null,
        ingestDuplicateSimilarityThreshold: settings.ingestDuplicateSimilarityThreshold ?? null,
        ingestDuplicateLookbackDays: settings.ingestDuplicateLookbackDays ?? null,
        ingestConfidenceHighMin: settings.ingestConfidenceHighMin ?? null,
        ingestConfidenceMediumMin: settings.ingestConfidenceMediumMin ?? null,
        venueGenerationModel: settings.venueGenerationModel ?? null,
        venueAutoPublish: settings.venueAutoPublish,
        regionAutoPublishVenues: settings.regionAutoPublishVenues,
        regionAutoPublishEvents: settings.regionAutoPublishEvents,
        regionAutoPublishArtists: settings.regionAutoPublishArtists,
        regionAutoPublishArtworks: settings.regionAutoPublishArtworks,
        regionDiscoveryEnabled: settings.regionDiscoveryEnabled,
        regionMaxVenuesPerRun: settings.regionMaxVenuesPerRun ?? null,
        enrichMatchedArtists: settings.enrichMatchedArtists,
        autoTagEnabled: settings.autoTagEnabled ?? false,
        autoTagProvider: settings.autoTagProvider ?? null,
        autoTagModel: settings.autoTagModel ?? null,
        editorialNotifyTo: settings.editorialNotifyTo ?? null,
        editorialNotificationsWebhookUrl: settings.editorialNotificationsWebhookUrl ?? null,
        editorialNotificationsEmailEnabled: settings.editorialNotificationsEmailEnabled,
        alertWebhookUrl: settings.alertWebhookUrl ?? null,
        alertWebhookSecretSet: Boolean(settings.alertWebhookSecret),
        googleIndexingEnabled: settings.googleIndexingEnabled,
        googleServiceAccountJsonSet: Boolean(settings.googleServiceAccountJson),
        envFallbacks: {
          OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
          GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY?.trim()),
          ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
          GOOGLE_PSE_API_KEY: Boolean(process.env.GOOGLE_PSE_API_KEY?.trim()),
          GOOGLE_PSE_CX: Boolean(process.env.GOOGLE_PSE_CX?.trim()),
          BRAVE_SEARCH_API_KEY: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
          RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY?.trim()),
          STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
          STRIPE_PUBLISHABLE_KEY: Boolean(process.env.STRIPE_PUBLISHABLE_KEY?.trim()),
          STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
          GOOGLE_SERVICE_ACCOUNT_JSON: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
        },
      } satisfies SiteSettingsShape} />
    </div>
  );
}
