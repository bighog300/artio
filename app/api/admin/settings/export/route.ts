import { unstable_noStore } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";

export const runtime = "nodejs";

const SECRET_KEYS = new Set(["openAiApiKey", "geminiApiKey", "anthropicApiKey", "googlePseApiKey", "braveSearchApiKey", "resendApiKey", "stripeSecretKey", "stripeWebhookSecret", "googleServiceAccountJson", "stripePublishableKey"]);

export async function GET() {
  unstable_noStore();
  try {
    const admin = await requireAdmin();
    const settings = await getSiteSettings();
    const exported: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (["id", "updatedAt", "createdAt", "logoAssetId", "logoAsset"].includes(key)) continue;
      if (SECRET_KEYS.has(key)) continue;
      if (value !== null && value !== undefined) exported[key] = value;
    }
    const now = new Date();
    const d = now.toISOString().slice(0, 10);
    void logAdminAction({
      actorEmail: admin.email,
      action: "SETTINGS_EXPORTED",
      targetType: "site_settings",
      targetId: "default",
      metadata: { exportedAt: new Date().toISOString() },
    });
    return new Response(JSON.stringify({ _exportedAt: now.toISOString(), _version: 1, settings: exported }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"artpulse-settings-${d}.json\"`,
      },
    });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_settings_export_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
