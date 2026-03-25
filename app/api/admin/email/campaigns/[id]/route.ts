import { Prisma } from "@prisma/client";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from "@/lib/email/campaign-enums";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";

import { db } from "@/lib/db";
import { parseBody, zodDetails } from "@/lib/validators";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { isForbiddenError } from "@/lib/http-errors";

export const runtime = "nodejs";

const campaignUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().optional().nullable(),
  campaignType: z.enum(CAMPAIGN_TYPES).optional(),
  audienceType: z.enum(CAMPAIGN_AUDIENCES).optional(),
  audienceFilter: z.record(z.string(), z.unknown()).optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const parsed = campaignUpdateSchema.safeParse(await parseBody(req));
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
    }

    const campaign = await db.emailCampaign.findUnique({ where: { id } });
    if (!campaign) return apiError(404, "not_found", "Campaign not found");
    if (campaign.status !== "DRAFT") return apiError(409, "conflict", "Only DRAFT campaigns can be updated");

    const updated = await db.emailCampaign.update({
      where: { id },
      data: {
        ...parsed.data,
        audienceFilter: parsed.data.audienceFilter === undefined
          ? undefined
          : parsed.data.audienceFilter === null
            ? Prisma.JsonNull
            : (parsed.data.audienceFilter as Prisma.InputJsonValue),
        scheduledFor: parsed.data.scheduledFor === undefined ? undefined : (parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null),
      },
    });

    return Response.json(updated);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const campaign = await db.emailCampaign.findUnique({ where: { id }, select: { status: true } });
    if (!campaign) return apiError(404, "not_found", "Campaign not found");
    if (campaign.status !== "DRAFT") return apiError(409, "conflict", "Only DRAFT campaigns can be deleted");

    await db.emailCampaign.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
