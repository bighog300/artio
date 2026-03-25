import { Prisma } from "@prisma/client";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_TYPES } from "@/lib/email/campaign-enums";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";

import { db } from "@/lib/db";
import { parseBody, zodDetails } from "@/lib/validators";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { isForbiddenError } from "@/lib/http-errors";

export const runtime = "nodejs";

const campaignCreateSchema = z.object({
  name: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional().nullable(),
  campaignType: z.enum(CAMPAIGN_TYPES).optional(),
  audienceType: z.enum(CAMPAIGN_AUDIENCES),
  audienceFilter: z.record(z.string(), z.unknown()).optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    await requireAdmin();
    const campaigns = await db.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ campaigns });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const parsed = campaignCreateSchema.safeParse(await parseBody(req));
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
    }

    const created = await db.emailCampaign.create({
      data: {
        name: parsed.data.name,
        subject: parsed.data.subject,
        bodyHtml: parsed.data.bodyHtml,
        bodyText: parsed.data.bodyText ?? null,
        campaignType: parsed.data.campaignType ?? "BROADCAST",
        audienceType: parsed.data.audienceType,
        audienceFilter: parsed.data.audienceFilter === null ? Prisma.JsonNull : (parsed.data.audienceFilter as Prisma.InputJsonValue | undefined),
        status: parsed.data.scheduledFor ? "SCHEDULED" : "DRAFT",
        scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
        createdByUserId: user.id,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
