import { NextRequest } from "next/server";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { db } from "@/lib/db";
import { getResendClient } from "@/lib/email/client";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { verifyArtworkOfferToken } from "@/lib/artwork-offer-token";

export const runtime = "nodejs";

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html><body style="font-family: sans-serif; padding: 24px;">${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string; offerId: string }> }) {
  const { key, offerId } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token || !verifyArtworkOfferToken(offerId, token)) return html("<h1>Invalid token</h1>", 400);

  const offer = await db.artworkOffer.findFirst({
    where: {
      id: offerId,
      artwork: isArtworkIdKey(key)
        ? { id: key, isPublished: true, deletedAt: null }
        : { slug: key, isPublished: true, deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      buyerName: true,
      buyerEmail: true,
      artwork: { select: { title: true } },
    },
  });

  if (!offer) return html("<h1>Offer not found</h1>", 404);
  if (offer.status !== "PENDING") return html("<h1>Offer already actioned</h1>", 409);

  await db.artworkOffer.update({ where: { id: offer.id }, data: { status: "DECLINED", artistResponse: "Declined" } });

  const settings = await getSiteSettings();
  const resendApiKey = settings.resendApiKey?.trim();
  const fromAddress = settings.resendFromAddress ?? settings.emailFromAddress ?? "Artio <noreply@mail.artio.co>";
  if (resendApiKey) {
    const resend = getResendClient(resendApiKey);
    await resend.emails.send({
      from: fromAddress,
      to: offer.buyerEmail,
      subject: `Update on your offer for ${offer.artwork.title}`,
      html: `<p>Hi ${offer.buyerName},</p><p>Thank you for your offer on ${offer.artwork.title}. The artist has declined this offer.</p>`,
      text: `Hi ${offer.buyerName}, thank you for your offer on ${offer.artwork.title}. The artist has declined this offer.`,
      tags: [{ name: "type", value: "ARTWORK_OFFER_DECLINED" }],
    });
  }

  return html("<h1>Offer declined</h1><p>The buyer has been notified.</p>");
}
