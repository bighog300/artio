import { NextRequest } from "next/server";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { db } from "@/lib/db";
import { getResendClient } from "@/lib/email/client";
import { formatPrice } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { getStripeClient } from "@/lib/stripe";
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
      buyerName: true,
      buyerEmail: true,
      offerAmount: true,
      currency: true,
      status: true,
      expiresAt: true,
      artwork: {
        select: {
          id: true,
          slug: true,
          title: true,
          soldAt: true,
          artist: { select: { stripeAccount: { select: { stripeAccountId: true, chargesEnabled: true } } } },
        },
      },
    },
  });

  if (!offer) return html("<h1>Offer not found</h1>", 404);
  if (offer.status !== "PENDING") return html("<h1>Offer already actioned</h1>", 409);
  if (offer.expiresAt && offer.expiresAt < new Date()) {
    await db.artworkOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
    return html("<h1>Offer expired</h1>", 410);
  }
  if (offer.artwork.soldAt) return html("<h1>Artwork is already sold</h1>", 409);

  const stripeAccountId = offer.artwork.artist.stripeAccount?.stripeAccountId;
  const chargesEnabled = offer.artwork.artist.stripeAccount?.chargesEnabled;
  if (!stripeAccountId || !chargesEnabled) return html("<h1>Artist Stripe account is not ready</h1>", 400);

  const settings = await getSiteSettings();
  const appUrl = req.nextUrl.origin;
  const feePercent = settings.platformFeePercent;
  const platformFeeAmount = Math.round((offer.offerAmount * feePercent) / 100);

  const stripe = await getStripeClient();
  const artworkKey = offer.artwork.slug ?? offer.artwork.id;
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: offer.currency.toLowerCase(),
        product_data: { name: `${offer.artwork.title} (accepted offer)` },
        unit_amount: offer.offerAmount,
      },
      quantity: 1,
    }],
    application_fee_amount: platformFeeAmount,
    transfer_data: { destination: stripeAccountId },
    customer_email: offer.buyerEmail,
    metadata: { artworkOrderId: offer.artwork.id },
    success_url: `${appUrl}/artwork/${artworkKey}/order/success`,
    cancel_url: `${appUrl}/artwork/${artworkKey}`,
    mode: "payment",
  } as never);

  await db.$transaction([
    db.artworkOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", artistResponse: "Accepted" } }),
    db.artworkOrder.create({
      data: {
        artworkId: offer.artwork.id,
        buyerUserId: null,
        buyerName: offer.buyerName,
        buyerEmail: offer.buyerEmail,
        amountPaid: offer.offerAmount,
        currency: offer.currency,
        platformFeeAmount,
        stripeSessionId: session.id,
      },
    }),
  ]);

  const resendApiKey = settings.resendApiKey?.trim();
  const fromAddress = settings.resendFromAddress ?? settings.emailFromAddress ?? "Artpulse <noreply@mail.artpulse.co>";
  if (resendApiKey) {
    const resend = getResendClient(resendApiKey);
    await resend.emails.send({
      from: fromAddress,
      to: offer.buyerEmail,
      subject: `Your offer was accepted: ${offer.artwork.title}`,
      html: `<p>Good news ${offer.buyerName}, your offer was accepted.</p><p><a href="${session.url}">Complete checkout</a></p>`,
      text: `Your offer was accepted for ${offer.artwork.title}. Complete checkout: ${session.url ?? ""}`,
      tags: [{ name: "type", value: "ARTWORK_OFFER_ACCEPTED" }],
    });
  }

  return html(`<h1>Offer accepted</h1><p>The buyer has been emailed a checkout link for ${formatPrice(offer.offerAmount, offer.currency)}.</p>`);
}
