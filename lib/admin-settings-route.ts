import { z } from "zod";
import { apiError } from "@/lib/api";
import { withAdminRoute } from "@/lib/admin-route";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { updateSiteSettings } from "@/lib/site-settings/update-site-settings";
import { parseBody, zodDetails } from "@/lib/validators";
import type { requireAdmin } from "@/lib/admin";

const patchSchema = z.object({
  ingestSystemPrompt: z.string().trim().min(1).nullable().optional(),
  ingestModel: z.string().trim().min(1).nullable().optional(),
  ingestMaxOutputTokens: z.number().int().positive().nullable().optional(),
  emailEnabled: z.boolean().optional(),
  emailFromAddress: z.string().max(200).nullable().optional(),
  resendApiKey: z.string().max(500).nullable().optional(),
  resendFromAddress: z.string().max(200).nullable().optional(),
  stripePublishableKey: z.string().max(500).nullable().optional(),
  stripeSecretKey: z.string().max(500).nullable().optional(),
  stripeWebhookSecret: z.string().max(500).nullable().optional(),
  platformFeePercent: z.number().int().min(1).max(100).optional(),
  emailOutboxBatchSize: z.number().int().min(1).max(100).nullable().optional(),
  analyticsSalt: z.string().max(500).nullable().optional(),
  openAiApiKey: z.string().max(500).nullable().optional(),
  geminiApiKey: z.string().max(500).nullable().optional(),
  anthropicApiKey: z.string().max(500).nullable().optional(),
  googlePseApiKey: z.string().max(500).nullable().optional(),
  braveSearchApiKey: z.string().max(500).nullable().optional(),
  googlePseCx: z.string().max(500).nullable().optional(),
  eventExtractionProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  venueEnrichmentProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  artistLookupProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  artistBioProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  artworkExtractionProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  autoTagEnabled: z.boolean().optional(),
  autoTagProvider: z.enum(["openai", "gemini", "claude"]).nullable().optional(),
  autoTagModel: z.string().max(100).nullable().optional(),
  ingestEnabled: z.boolean().optional(),
  ingestMaxCandidatesPerVenueRun: z.number().int().positive().nullable().optional(),
  ingestDuplicateSimilarityThreshold: z.number().int().min(0).max(100).nullable().optional(),
  ingestDuplicateLookbackDays: z.number().int().positive().nullable().optional(),
  ingestConfidenceHighMin: z.number().int().min(0).max(100).nullable().optional(),
  ingestConfidenceMediumMin: z.number().int().min(0).max(100).nullable().optional(),
  ingestImageEnabled: z.boolean().optional(),
  venueGenerationModel: z.string().max(100).nullable().optional(),
  venueAutoPublish: z.boolean().optional(),
  editorialNotifyTo: z.string().max(500).nullable().optional(),
  editorialNotificationsWebhookUrl: z.string().url().max(500).nullable().optional(),
  editorialNotificationsEmailEnabled: z.boolean().optional(),
  alertWebhookUrl: z.string().url().max(500).nullable().optional(),
  alertWebhookSecret: z.string().max(500).nullable().optional(),
  googleServiceAccountJson: z.string().max(100000).nullable().optional(),
  googleIndexingEnabled: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (
    data.ingestConfidenceHighMin != null
    && data.ingestConfidenceMediumMin != null
    && data.ingestConfidenceHighMin <= data.ingestConfidenceMediumMin
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ingestConfidenceHighMin"],
      message: "ingestConfidenceHighMin must be greater than ingestConfidenceMediumMin",
    });
  }
});

export async function handleAdminSettingsGet(_req: Request, deps: {
  getSiteSettingsFn?: typeof getSiteSettings;
  requireAdminFn?: typeof requireAdmin;
} = {}) {
  return withAdminRoute(async () => {
    const settings = await (deps.getSiteSettingsFn ?? getSiteSettings)();
    return Response.json({
      ingestSystemPrompt: settings.ingestSystemPrompt,
      ingestModel: settings.ingestModel,
      ingestMaxOutputTokens: settings.ingestMaxOutputTokens,
      emailEnabled: settings.emailEnabled,
      emailFromAddress: settings.emailFromAddress,
      resendApiKey: settings.resendApiKey,
      resendFromAddress: settings.resendFromAddress,
      stripePublishableKey: settings.stripePublishableKey,
      stripeSecretKeySet: Boolean(settings.stripeSecretKey),
      stripeWebhookSecretSet: Boolean(settings.stripeWebhookSecret),
      platformFeePercent: settings.platformFeePercent,
      emailOutboxBatchSize: settings.emailOutboxBatchSize,
      analyticsSalt: settings.analyticsSalt,
      openAiApiKeySet: Boolean(settings.openAiApiKey),
      geminiApiKeySet: Boolean(settings.geminiApiKey),
      anthropicApiKeySet: Boolean(settings.anthropicApiKey),
      googlePseApiKeySet: Boolean(settings.googlePseApiKey),
      braveSearchApiKeySet: Boolean(settings.braveSearchApiKey),
      googlePseCx: settings.googlePseCx,
      eventExtractionProvider: settings.eventExtractionProvider,
      venueEnrichmentProvider: settings.venueEnrichmentProvider,
      artistLookupProvider: settings.artistLookupProvider,
      artistBioProvider: settings.artistBioProvider,
      artworkExtractionProvider: settings.artworkExtractionProvider,
      autoTagEnabled: settings.autoTagEnabled ?? false,
      autoTagProvider: settings.autoTagProvider ?? null,
      autoTagModel: settings.autoTagModel ?? null,
      ingestEnabled: settings.ingestEnabled,
      ingestMaxCandidatesPerVenueRun: settings.ingestMaxCandidatesPerVenueRun,
      ingestDuplicateSimilarityThreshold: settings.ingestDuplicateSimilarityThreshold,
      ingestDuplicateLookbackDays: settings.ingestDuplicateLookbackDays,
      ingestConfidenceHighMin: settings.ingestConfidenceHighMin,
      ingestConfidenceMediumMin: settings.ingestConfidenceMediumMin,
      ingestImageEnabled: settings.ingestImageEnabled,
      venueGenerationModel: settings.venueGenerationModel,
      venueAutoPublish: settings.venueAutoPublish,
      editorialNotifyTo: settings.editorialNotifyTo,
      editorialNotificationsWebhookUrl: settings.editorialNotificationsWebhookUrl,
      editorialNotificationsEmailEnabled: settings.editorialNotificationsEmailEnabled,
      alertWebhookUrl: settings.alertWebhookUrl,
      alertWebhookSecretSet: Boolean(settings.alertWebhookSecret),
      googleIndexingEnabled: settings.googleIndexingEnabled,
      googleServiceAccountJsonSet: Boolean(settings.googleServiceAccountJson),
    });
  }, { requireAdminFn: deps.requireAdminFn });
}

export async function handleAdminSettingsPatch(req: Request, deps: {
  updateSiteSettingsFn?: typeof updateSiteSettings;
  requireAdminFn?: typeof requireAdmin;
} = {}) {
  return withAdminRoute(async () => {
    const parsed = patchSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const updated = await (deps.updateSiteSettingsFn ?? updateSiteSettings)(parsed.data);
    return Response.json({
      ok: true,
      settings: {
        ingestSystemPrompt: updated.ingestSystemPrompt,
        ingestModel: updated.ingestModel,
        ingestMaxOutputTokens: updated.ingestMaxOutputTokens,
        emailEnabled: updated.emailEnabled,
        emailFromAddress: updated.emailFromAddress,
        resendApiKey: updated.resendApiKey,
        resendFromAddress: updated.resendFromAddress,
        stripePublishableKey: updated.stripePublishableKey,
        stripeSecretKeySet: Boolean(updated.stripeSecretKey),
        stripeWebhookSecretSet: Boolean(updated.stripeWebhookSecret),
        platformFeePercent: updated.platformFeePercent,
        emailOutboxBatchSize: updated.emailOutboxBatchSize,
        analyticsSalt: updated.analyticsSalt,
        openAiApiKeySet: Boolean(updated.openAiApiKey),
        geminiApiKeySet: Boolean(updated.geminiApiKey),
        anthropicApiKeySet: Boolean(updated.anthropicApiKey),
        googlePseApiKeySet: Boolean(updated.googlePseApiKey),
        braveSearchApiKeySet: Boolean(updated.braveSearchApiKey),
        googlePseCx: updated.googlePseCx,
        eventExtractionProvider: updated.eventExtractionProvider,
        venueEnrichmentProvider: updated.venueEnrichmentProvider,
        artistLookupProvider: updated.artistLookupProvider,
        artistBioProvider: updated.artistBioProvider,
        artworkExtractionProvider: updated.artworkExtractionProvider,
        autoTagEnabled: updated.autoTagEnabled,
        autoTagProvider: updated.autoTagProvider,
        autoTagModel: updated.autoTagModel,
        ingestEnabled: updated.ingestEnabled,
        ingestMaxCandidatesPerVenueRun: updated.ingestMaxCandidatesPerVenueRun,
        ingestDuplicateSimilarityThreshold: updated.ingestDuplicateSimilarityThreshold,
        ingestDuplicateLookbackDays: updated.ingestDuplicateLookbackDays,
        ingestConfidenceHighMin: updated.ingestConfidenceHighMin,
        ingestConfidenceMediumMin: updated.ingestConfidenceMediumMin,
        ingestImageEnabled: updated.ingestImageEnabled,
        venueGenerationModel: updated.venueGenerationModel,
        venueAutoPublish: updated.venueAutoPublish,
        editorialNotifyTo: updated.editorialNotifyTo,
        editorialNotificationsWebhookUrl: updated.editorialNotificationsWebhookUrl,
        editorialNotificationsEmailEnabled: updated.editorialNotificationsEmailEnabled,
        alertWebhookUrl: updated.alertWebhookUrl,
        alertWebhookSecretSet: Boolean(updated.alertWebhookSecret),
        googleIndexingEnabled: updated.googleIndexingEnabled,
        googleServiceAccountJsonSet: Boolean(updated.googleServiceAccountJson),
      },
    });
  }, { requireAdminFn: deps.requireAdminFn });
}
