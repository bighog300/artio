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
  emailOutboxBatchSize: z.number().int().min(1).max(100).nullable().optional(),
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
      emailOutboxBatchSize: settings.emailOutboxBatchSize,
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
        emailOutboxBatchSize: updated.emailOutboxBatchSize,
      },
    });
  }, { requireAdminFn: deps.requireAdminFn });
}
