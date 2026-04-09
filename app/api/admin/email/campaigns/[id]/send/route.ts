import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";

import { db } from "@/lib/db";
import { resolveAudience } from "@/lib/email/audience";
import { generateUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { isForbiddenError } from "@/lib/http-errors";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const campaign = await db.emailCampaign.findUnique({ where: { id } });
    if (!campaign) return apiError(404, "not_found", "Campaign not found");
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      return apiError(409, "conflict", "Campaign must be DRAFT or SCHEDULED before sending");
    }

    const filter = (campaign.audienceFilter ?? undefined) as Record<string, unknown> | undefined;

    if (campaign.campaignType === "VENUE_CLAIM_INVITE") {
      const venueId = typeof filter?.venueId === "string" ? filter.venueId : null;
      const recipientEmail = typeof filter?.recipientEmail === "string" ? filter.recipientEmail.trim().toLowerCase() : "";
      const personalMessage = typeof filter?.personalMessage === "string" ? filter.personalMessage.trim().slice(0, 500) : "";
      if (!venueId || !recipientEmail) return apiError(400, "invalid_request", "Venue invite campaigns require venue and recipient email");

      const venue = await db.venue.findUnique({
        where: { id: venueId },
        select: { id: true, name: true, slug: true, description: true },
      });
      if (!venue) return apiError(404, "not_found", "Venue not found");

      const upcomingEventCount = await db.event.count({ where: { venueId, startAt: { gte: new Date() } } });
      const token = randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";
      const claimUrl = `${appUrl}/claim/${token}`;

      const invite = await db.venueClaimInvite.create({
        data: {
          venueId: venue.id,
          email: recipientEmail,
          token,
          personalMessage: personalMessage || null,
          sentAt: now,
          expiresAt,
          createdByUserId: admin.id,
        },
      });

      await db.notificationOutbox.create({
        data: {
          type: "VENUE_CLAIM_INVITE",
          toEmail: recipientEmail,
          dedupeKey: `venue-claim-invite:${campaign.id}:${invite.id}`,
          payload: {
            type: "VENUE_CLAIM_INVITE",
            venueName: venue.name,
            venueSlug: venue.slug,
            venueDescription: venue.description?.slice(0, 160) ?? null,
            upcomingEventCount,
            personalMessage: personalMessage || null,
            claimUrl,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      await db.emailCampaign.update({
        where: { id },
        data: { status: "SENDING", recipientCount: 1 },
      });

      return Response.json({ ok: true, enqueued: 1 });
    }

    const audience = await resolveAudience(db, campaign.audienceType, filter);
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
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Admin role required");
    console.error("admin_email_campaigns_id_send_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
