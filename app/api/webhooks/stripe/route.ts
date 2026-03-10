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
    enqueueNotification: (params) => enqueueNotification(params as never),
  });
}
