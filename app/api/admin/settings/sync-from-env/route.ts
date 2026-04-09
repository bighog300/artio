import { unstable_noStore } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { updateSiteSettings } from "@/lib/site-settings/update-site-settings";

export const runtime = "nodejs";

const ENV_TO_DB_MAP = [
  { env: "OPENAI_API_KEY", field: "openAiApiKey" },
  { env: "GEMINI_API_KEY", field: "geminiApiKey" },
  { env: "ANTHROPIC_API_KEY", field: "anthropicApiKey" },
  { env: "GOOGLE_PSE_API_KEY", field: "googlePseApiKey" },
  { env: "GOOGLE_PSE_CX", field: "googlePseCx" },
  { env: "BRAVE_SEARCH_API_KEY", field: "braveSearchApiKey" },
  { env: "RESEND_API_KEY", field: "resendApiKey" },
  { env: "STRIPE_SECRET_KEY", field: "stripeSecretKey" },
  { env: "STRIPE_PUBLISHABLE_KEY", field: "stripePublishableKey" },
  { env: "STRIPE_WEBHOOK_SECRET", field: "stripeWebhookSecret" },
  { env: "GOOGLE_SERVICE_ACCOUNT_JSON", field: "googleServiceAccountJson" },
] as const;

export async function POST() {
  unstable_noStore();
  try {
    const admin = await requireAdmin();
    const settings = await getSiteSettings();
    const toSync: Record<string, string> = {};
    const synced: string[] = [];
    const alreadySet: string[] = [];
    const notFound: string[] = [];

    for (const { env, field } of ENV_TO_DB_MAP) {
      const envValue = process.env[env]?.trim();
      const dbValue = (settings as Record<string, unknown>)[field];
      if (!envValue) notFound.push(field);
      else if (dbValue != null && String(dbValue).trim() !== "") alreadySet.push(field);
      else {
        toSync[field] = envValue;
        synced.push(field);
      }
    }

    if (Object.keys(toSync).length > 0) {
      await updateSiteSettings(toSync);
      void logAdminAction({
        actorEmail: admin.email,
        action: "SETTINGS_SYNCED_FROM_ENV",
        targetType: "site_settings",
        targetId: "default",
        metadata: { synced, alreadySet, notFound },
      });
    }
    return NextResponse.json({ ok: true, synced, alreadySet, notFound });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_settings_sync_from_env_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
