import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";

import { db } from "@/lib/db";
import { resolveAudience } from "@/lib/email/audience";
import { generateUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const campaign = await db.emailCampaign.findUnique({ where: { id } });
    if (!campaign) return apiError(404, "not_found", "Campaign not found");
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      return apiError(409, "conflict", "Campaign must be DRAFT or SCHEDULED before sending");
    }

    const audience = await resolveAudience(db, campaign.audienceType, (campaign.audienceFilter ?? undefined) as Record<string, unknown> | undefined);
    if (!audience.length) {
      await db.emailCampaign.update({
        where: { id },
        data: { status: "SENT", recipientCount: 0, sentAt: new Date() },
      });
      return Response.json({ ok: true, enqueued: 0 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

    await db.notificationOutbox.createMany({
      data: audience.map((email) => {
        const token = generateUnsubscribeToken(email);
        const unsubscribeUrl = `${appUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
        return {
          type: "BROADCAST",
          toEmail: email,
          payload: {
            type: "BROADCAST",
            campaignId: campaign.id,
            subject: campaign.subject,
            bodyHtml: campaign.bodyHtml,
            bodyText: campaign.bodyText,
            unsubscribeUrl,
            tags: [{ name: "campaignId", value: campaign.id }],
          },
          dedupeKey: `broadcast:${campaign.id}:${email}:${randomUUID()}`,
        };
      }),
      skipDuplicates: true,
    });

    await db.emailCampaign.update({
      where: { id },
      data: {
        status: "SENDING",
        recipientCount: audience.length,
      },
    });

    return Response.json({ ok: true, enqueued: audience.length });
  } catch {
    return apiError(403, "forbidden", "Admin role required");
  }
}
