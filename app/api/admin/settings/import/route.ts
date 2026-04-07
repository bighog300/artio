import { unstable_noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { updateSiteSettings } from "@/lib/site-settings/update-site-settings";

export const runtime = "nodejs";

const secretFields = ["openAiApiKey", "geminiApiKey", "anthropicApiKey", "googlePseApiKey", "braveSearchApiKey", "resendApiKey", "stripeSecretKey", "stripeWebhookSecret", "googleServiceAccountJson", "stripePublishableKey"] as const;

const providerEnum = z.enum(["openai", "gemini", "claude"]);
const settingsSchema = z.object({ emailEnabled: z.boolean().optional(), emailFromAddress: z.string().nullable().optional(), resendFromAddress: z.string().nullable().optional(), platformFeePercent: z.number().int().min(1).max(100).optional(), emailOutboxBatchSize: z.number().int().nullable().optional(), ingestSystemPrompt: z.string().nullable().optional(), artworkExtractionSystemPrompt: z.string().nullable().optional(), artistBioSystemPrompt: z.string().nullable().optional(), ingestModel: z.string().nullable().optional(), ingestMaxOutputTokens: z.number().int().nullable().optional(), analyticsSalt: z.string().nullable().optional(), googlePseCx: z.string().nullable().optional(), eventExtractionProvider: providerEnum.nullable().optional(), venueEnrichmentProvider: providerEnum.nullable().optional(), artistLookupProvider: providerEnum.nullable().optional(), artistBioProvider: providerEnum.nullable().optional(), artworkExtractionProvider: providerEnum.nullable().optional(), ingestEnabled: z.boolean().optional(), ingestMaxCandidatesPerVenueRun: z.number().int().nullable().optional(), ingestDuplicateSimilarityThreshold: z.number().int().nullable().optional(), ingestDuplicateLookbackDays: z.number().int().nullable().optional(), ingestConfidenceHighMin: z.number().int().nullable().optional(), ingestConfidenceMediumMin: z.number().int().nullable().optional(), ingestImageEnabled: z.boolean().optional(), autoTagEnabled: z.boolean().optional(), autoTagProvider: providerEnum.nullable().optional(), autoTagModel: z.string().nullable().optional(), venueGenerationModel: z.string().nullable().optional(), venueAutoPublish: z.boolean().optional(), regionAutoPublishVenues: z.boolean().optional(), regionAutoPublishEvents: z.boolean().optional(), regionAutoPublishArtists: z.boolean().optional(), regionAutoPublishArtworks: z.boolean().optional(), enrichMatchedArtists: z.boolean().optional(), regionDiscoveryEnabled: z.boolean().optional(), regionMaxVenuesPerRun: z.number().int().nullable().optional(), editorialNotifyTo: z.string().nullable().optional(), editorialNotificationsWebhookUrl: z.string().nullable().optional(), editorialNotificationsEmailEnabled: z.boolean().optional(), alertWebhookUrl: z.string().nullable().optional(), googleIndexingEnabled: z.boolean().optional() }).strict();

const importSchema = z.object({ _exportedAt: z.string().optional(), _version: z.number().optional(), settings: settingsSchema });

const fmt = (v: unknown) => typeof v === "string" ? (v.length > 60 ? `${v.slice(0, 60)}…` : v) : (v == null ? "null" : String(v));

export async function POST(req: NextRequest) {
  unstable_noStore();
  try {
    await requireAdmin();
    const body = await req.json();
    if (secretFields.some((f) => Object.prototype.hasOwnProperty.call(body?.settings ?? {}, f))) return apiError(400, "secrets_not_allowed", "secrets_not_allowed");

    const parsed = importSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const current = await getSiteSettings();
    const incoming = parsed.data.settings;
    const willChange: Array<{ field: string; from: string; to: string }> = [];
    const unchanged: string[] = [];

    for (const [field, to] of Object.entries(incoming)) {
      const from = (current as Record<string, unknown>)[field];
      if (from === to) unchanged.push(field);
      else willChange.push({ field, from: fmt(from), to: fmt(to) });
    }

    if (req.nextUrl.searchParams.get("apply") === "true") {
      await updateSiteSettings(incoming);
      return NextResponse.json({ ok: true, applied: willChange.length });
    }

    return NextResponse.json({ ok: true, preview: true, willChange, unchanged });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
