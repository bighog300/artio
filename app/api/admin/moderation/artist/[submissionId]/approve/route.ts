import { createAdminModerationDeps } from "@/lib/admin-moderation-db";
import { handleAdminModerationApprove } from "@/lib/admin-moderation-route";
export const runtime = "nodejs";

export async function POST(_req: Request, context: { params: Promise<{ submissionId: string }> }) {
  return handleAdminModerationApprove("ARTIST", await context.params, createAdminModerationDeps());
}
