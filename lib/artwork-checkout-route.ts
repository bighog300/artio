import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseBody, zodDetails } from "@/lib/validators";

export type ArtworkRecord = {
  id: string;
  title: string;
  slug: string | null;
  priceAmount: number;
  currency: string;
  soldAt: Date | null;
  artistId: string;
  artistStripeAccountId: string | null;
  artistStripeChargesEnabled: boolean;
};

export type ArtworkCheckoutDeps = {
  getSessionUser: () => Promise<{ id: string } | null>;
  findPublishedArtwork: (key: string) => Promise<ArtworkRecord | null>;
  createOrder: (data: {
    artworkId: string;
    buyerUserId: string | null;
    buyerName: string;
    buyerEmail: string;
    amountPaid: number;
    currency: string;
    platformFeeAmount: number;
    stripeSessionId: string;
  }) => Promise<{ id: string }>;
  createCheckoutSession: (params: {
    payment_method_types: ["card"];
    line_items: Array<{
      price_data: {
        currency: string;
        product_data: { name: string };
        unit_amount: number;
      };
      quantity: 1;
    }>;
    application_fee_amount: number;
    transfer_data: { destination: string };
    customer_email: string;
    metadata: { artworkOrderId: string };
    success_url: string;
    cancel_url: string;
    mode: "payment";
  }) => Promise<{ id: string; url: string | null }>;
  getPlatformFeePercent: () => Promise<number>;
  appUrl?: string;
};

const bodySchema = z.object({
  buyerName: z.string().trim().min(2).max(200),
  buyerEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function handlePostArtworkCheckout(req: Request, artworkKey: string, deps: ArtworkCheckoutDeps): Promise<Response> {
  const artwork = await deps.findPublishedArtwork(artworkKey);
  if (!artwork) return apiError(404, "not_found", "Artwork not found");
  if (artwork.soldAt) return apiError(409, "already_sold", "Artwork has already been sold");

  if (!artwork.artistStripeAccountId || !artwork.artistStripeChargesEnabled) {
    return apiError(400, "stripe_not_connected", "Artist does not have an active Stripe account");
  }

  const parsedBody = bodySchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  const [user, feePercent] = await Promise.all([
    deps.getSessionUser(),
    deps.getPlatformFeePercent(),
  ]);

  const appUrl = (deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!appUrl) return apiError(500, "misconfigured", "Application URL is not configured");

  const platformFeeAmount = Math.round((artwork.priceAmount * feePercent) / 100);
  const artworkPathKey = artwork.slug ?? artwork.id;

  const checkoutSession = await deps.createCheckoutSession({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: artwork.currency.toLowerCase(),
        product_data: { name: artwork.title },
        unit_amount: artwork.priceAmount,
      },
      quantity: 1,
    }],
    application_fee_amount: platformFeeAmount,
    transfer_data: { destination: artwork.artistStripeAccountId },
    customer_email: parsedBody.data.buyerEmail,
    metadata: { artworkOrderId: artwork.id },
    success_url: `${appUrl}/artwork/${artworkPathKey}/order/success`,
    cancel_url: `${appUrl}/artwork/${artworkPathKey}`,
    mode: "payment",
  });

  const order = await deps.createOrder({
    artworkId: artwork.id,
    buyerUserId: user?.id ?? null,
    buyerName: parsedBody.data.buyerName,
    buyerEmail: parsedBody.data.buyerEmail,
    amountPaid: artwork.priceAmount,
    currency: artwork.currency,
    platformFeeAmount,
    stripeSessionId: checkoutSession.id,
  });

  if (order.id) {
    // no-op; order id is persisted for webhook lookup by stripeSessionId
  }

  return Response.json({ url: checkoutSession.url }, { status: 200, headers: NO_STORE_HEADERS });
}
