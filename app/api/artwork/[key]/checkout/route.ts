import { NextRequest } from "next/server";
import { isAuthError, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { getStripeClient } from "@/lib/stripe";
import { apiError } from "@/lib/api";
import { handlePostArtworkCheckout } from "@/lib/artwork-checkout-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  try {
    const stripe = await getStripeClient();

    return await handlePostArtworkCheckout(req, key, {
      getSessionUser,
      findPublishedArtwork: (artworkKey) => db.artwork.findFirst({
        where: isArtworkIdKey(artworkKey)
          ? { id: artworkKey, isPublished: true, deletedAt: null }
          : { slug: artworkKey, isPublished: true, deletedAt: null },
        select: {
          id: true,
          title: true,
          slug: true,
          priceAmount: true,
          currency: true,
          soldAt: true,
          artistId: true,
          artist: {
            select: {
              stripeAccount: {
                select: {
                  stripeAccountId: true,
                  chargesEnabled: true,
                },
              },
            },
          },
        },
      }).then((artwork) => {
        if (!artwork || artwork.priceAmount == null || !artwork.currency) return null;
        return {
          id: artwork.id,
          title: artwork.title,
          slug: artwork.slug,
          priceAmount: artwork.priceAmount,
          currency: artwork.currency,
          soldAt: artwork.soldAt,
          artistId: artwork.artistId,
          artistStripeAccountId: artwork.artist.stripeAccount?.stripeAccountId ?? null,
          artistStripeChargesEnabled: artwork.artist.stripeAccount?.chargesEnabled ?? false,
        };
      }),
      createOrder: (data) => db.artworkOrder.create({ data, select: { id: true } }),
      createCheckoutSession: (sessionArgs) => stripe.checkout.sessions.create(sessionArgs as never),
      getPlatformFeePercent: async () => (await getSiteSettings()).platformFeePercent,
      appUrl: req.nextUrl.origin,
    });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to create checkout session");
  }
}
