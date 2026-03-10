import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { getStripeClient } from "@/lib/stripe";
import { handleStripeWebhook } from "@/lib/stripe-webhook-handler";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = await getStripeClient();
  return handleStripeWebhook(req, {
    getWebhookSecret: async () => (await getSiteSettings()).stripeWebhookSecret,
    constructEvent: (payload, signature, secret) => stripe.webhooks.constructEvent(payload, signature, secret),
    findStripeAccountByStripeAccountId: (stripeAccountId) => db.stripeAccount.findUnique({ where: { stripeAccountId }, select: { id: true } }),
    updateStripeAccount: (id, data) => db.stripeAccount.update({ where: { id }, data }),
    findArtistStripeAccountByStripeAccountId: (stripeAccountId) => db.artistStripeAccount.findUnique({ where: { stripeAccountId }, select: { id: true } }),
    updateArtistStripeAccount: (id, data) => db.artistStripeAccount.update({ where: { id }, data }),
    findRegistrationByPaymentIntentId: (stripePaymentIntentId) => db.registration.findFirst({ where: { stripePaymentIntentId }, select: { id: true, status: true } }),
    findRegistrationById: (id) => db.registration.findUnique({ where: { id }, select: { id: true, status: true } }),
    updateRegistrationStatus: (id, status) => db.registration.update({ where: { id }, data: { status } }),
    findArtworkOrderBySessionId: (sessionId) => db.artworkOrder.findFirst({
      where: { stripeSessionId: sessionId },
      select: { id: true, artworkId: true, status: true },
    }),
    confirmArtworkOrder: async (orderId, artworkId, paymentIntentId) => {
      await db.$transaction([
        db.artworkOrder.update({
          where: { id: orderId },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            stripePaymentIntentId: paymentIntentId ?? undefined,
          },
        }),
        db.artwork.update({
          where: { id: artworkId },
          data: { soldAt: new Date() },
        }),
      ]);

      const order = await db.artworkOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          buyerName: true,
          buyerEmail: true,
          artwork: {
            select: {
              title: true,
              slug: true,
              id: true,
              artist: {
                select: {
                  user: {
                    select: { email: true },
                  },
                },
              },
            },
          },
        },
      });

      const artistEmail = order?.artwork.artist.user?.email;
      if (order && artistEmail) {
        await enqueueNotification({
          type: "ARTWORK_INQUIRY_ARTIST",
          toEmail: artistEmail,
          dedupeKey: `artwork-order-confirmed:${order.id}:artist`,
          payload: {
            type: "ARTWORK_INQUIRY_ARTIST",
            artworkTitle: order.artwork.title,
            artworkSlug: order.artwork.slug ?? order.artwork.id,
            buyerName: order.buyerName,
            buyerEmail: order.buyerEmail,
            message: "A buyer completed checkout for this artwork.",
            inquiryId: order.id,
          },
        });
      }
    },
    enqueueNotification: (params) => enqueueNotification(params as never),
  });
}
