import { unstable_noStore as noStore } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { db } from "@/lib/db";
import { getResendClient } from "@/lib/email/client";
import { formatPrice } from "@/lib/format";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { signArtworkOfferToken } from "@/lib/artwork-offer-token";
import { parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

const offerSchema = z.object({
  buyerName: z.string().trim().min(2).max(100),
  buyerEmail: z.string().trim().toLowerCase().email(),
  offerAmount: z.coerce.number().positive(),
  message: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  noStore();
  try {
    await enforceRateLimit({ key: principalRateLimitKey(req, "public:artwork:offer"), ...RATE_LIMITS.publicWrite });
    const { key } = await ctx.params;
    const parsed = offerSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const artwork = await db.artwork.findFirst({
      where: isArtworkIdKey(key)
        ? { id: key, isPublished: true, deletedAt: null }
        : { slug: key, isPublished: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        soldAt: true,
        currency: true,
        artist: { select: { name: true, user: { select: { email: true } } } },
      },
    });

    if (!artwork) return apiError(404, "not_found", "Artwork not found");
    if (artwork.soldAt) return apiError(409, "already_sold", "Artwork has already been sold");

    const offerMinor = Math.round(parsed.data.offerAmount * 100);
    if (offerMinor <= 0) return apiError(400, "invalid_request", "Offer amount must be greater than zero");

    const currency = artwork.currency ?? "GBP";
    const offer = await db.artworkOffer.create({
      data: {
        artworkId: artwork.id,
        buyerName: parsed.data.buyerName,
        buyerEmail: parsed.data.buyerEmail,
        offerAmount: offerMinor,
        currency,
        message: parsed.data.message?.trim() || null,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, expiresAt: true },
    });

    const settings = await getSiteSettings();
    const resendApiKey = settings.resendApiKey?.trim();
    const fromAddress = settings.resendFromAddress ?? settings.emailFromAddress ?? "Artio <noreply@mail.artio.co>";
    const artistEmail = artwork.artist.user?.email?.trim() || process.env.INQUIRY_FALLBACK_EMAIL?.trim() || null;

    if (resendApiKey && artistEmail) {
      const token = signArtworkOfferToken(offer.id);
      const artworkKey = artwork.slug ?? artwork.id;
      const baseUrl = req.nextUrl.origin;
      const acceptUrl = `${baseUrl}/api/artwork/${encodeURIComponent(artworkKey)}/offer/${encodeURIComponent(offer.id)}/accept?token=${encodeURIComponent(token)}`;
      const declineUrl = `${baseUrl}/api/artwork/${encodeURIComponent(artworkKey)}/offer/${encodeURIComponent(offer.id)}/decline?token=${encodeURIComponent(token)}`;
      const resend = getResendClient(resendApiKey);
      const offerFormatted = formatPrice(offerMinor, currency);
      await resend.emails.send({
        from: fromAddress,
        to: artistEmail,
        replyTo: parsed.data.buyerEmail,
        subject: `New offer for ${artwork.title}`,
        html: `<p>${parsed.data.buyerName} made an offer on <strong>${artwork.title}</strong>.</p>
<p>Offer: <strong>${offerFormatted}</strong></p>
<p>Buyer: ${parsed.data.buyerName} (${parsed.data.buyerEmail})</p>
${parsed.data.message?.trim() ? `<p>Message: ${parsed.data.message.trim()}</p>` : ""}
<p>Expires: ${offer.expiresAt?.toUTCString() ?? "in 7 days"}</p>
<p><a href="${acceptUrl}">Accept offer</a></p>
<p><a href="${declineUrl}">Decline offer</a></p>`,
        text: `New offer for ${artwork.title}\nOffer: ${offerFormatted}\nBuyer: ${parsed.data.buyerName} (${parsed.data.buyerEmail})\n${parsed.data.message?.trim() ? `Message: ${parsed.data.message.trim()}\n` : ""}Accept: ${acceptUrl}\nDecline: ${declineUrl}`,
        tags: [{ name: "type", value: "ARTWORK_OFFER_ARTIST" }],
      });
    }

    return Response.json({ offerId: offer.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
