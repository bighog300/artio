import { ArtworkOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";

import type { StripeWebhookEvent } from "@/lib/stripe";

type Deps = {
  getWebhookSecret: () => Promise<string | null | undefined>;
  constructEvent: (payload: string, signature: string, secret: string) => StripeWebhookEvent;
  findStripeAccountByStripeAccountId: (stripeAccountId: string) => Promise<{ id: string } | null>;
  updateStripeAccount: (id: string, data: { chargesEnabled?: boolean; payoutsEnabled?: boolean; status: "ACTIVE" | "RESTRICTED" | "DEAUTHORIZED" }) => Promise<unknown>;
  findArtistStripeAccountByStripeAccountId: (stripeAccountId: string) => Promise<{ id: string } | null>;
  updateArtistStripeAccount: (id: string, data: { chargesEnabled?: boolean; payoutsEnabled?: boolean; status: "ACTIVE" | "RESTRICTED" | "DEAUTHORIZED" }) => Promise<unknown>;
  findRegistrationByPaymentIntentId: (paymentIntentId: string) => Promise<{ id: string; status: "PENDING" | "CONFIRMED" | "CANCELLED" | "WAITLISTED" } | null>;
  findRegistrationById: (registrationId: string) => Promise<{ id: string; status: "PENDING" | "CONFIRMED" | "CANCELLED" | "WAITLISTED" } | null>;
  updateRegistrationStatus: (registrationId: string, status: "CONFIRMED") => Promise<unknown>;
  findArtworkOrderBySessionId: (sessionId: string) => Promise<{ id: string; artworkId: string; status: ArtworkOrderStatus } | null>;
  confirmArtworkOrder: (orderId: string, artworkId: string, paymentIntentId: string | null) => Promise<void>;
  enqueueNotification: (params: { type: string; toEmail: string; payload: Record<string, unknown>; dedupeKey: string }) => Promise<unknown>;
};

export async function handleStripeWebhook(req: Request, deps: Deps) {
  const webhookSecret = (await deps.getWebhookSecret())?.trim();
  if (!webhookSecret) return apiError(500, "misconfigured", "Stripe webhook secret is not configured");

  const signature = req.headers.get("stripe-signature");
  if (!signature) return apiError(400, "invalid_signature", "Missing Stripe signature header");

  const payload = await req.text();
  let event: StripeWebhookEvent;
  try {
    event = deps.constructEvent(payload, signature, webhookSecret);
  } catch {
    return apiError(400, "invalid_signature", "Stripe signature verification failed");
  }

  if (event.type === "account.updated") {
    const accountId = event.data.object.id;
    if (accountId) {
      const isDeleted = event.data.object.deleted === true;
      const chargesEnabled = event.data.object.charges_enabled === true;
      const payoutsEnabled = event.data.object.payouts_enabled === true;
      const status = isDeleted ? "DEAUTHORIZED" : chargesEnabled ? "ACTIVE" : "RESTRICTED";

      const account = await deps.findStripeAccountByStripeAccountId(accountId);
      if (account) {
        await deps.updateStripeAccount(account.id, {
          chargesEnabled,
          payoutsEnabled,
          status,
        });
      }

      const artistAccount = await deps.findArtistStripeAccountByStripeAccountId(accountId);
      if (artistAccount) {
        await deps.updateArtistStripeAccount(artistAccount.id, {
          chargesEnabled,
          payoutsEnabled,
          status,
        });
      }
    }
  }

  if (event.type === "account.application.deauthorized") {
    const accountId = event.data.object.id;
    if (accountId) {
      const account = await deps.findStripeAccountByStripeAccountId(accountId);
      if (account) {
        await deps.updateStripeAccount(account.id, { status: "DEAUTHORIZED" });
      }

      const artistAccount = await deps.findArtistStripeAccountByStripeAccountId(accountId);
      if (artistAccount) {
        await deps.updateArtistStripeAccount(artistAccount.id, { status: "DEAUTHORIZED" });
      }
    }
  }

  if (event.type === "checkout.session.completed") {
    const paymentIntentId = event.data.object.payment_intent;
    const metadata = event.data.object.metadata as { registrationId?: string; artworkOrderId?: string } | undefined;
    const metadataRegistrationId = metadata?.registrationId;

    const registration = paymentIntentId
      ? await deps.findRegistrationByPaymentIntentId(paymentIntentId)
      : metadataRegistrationId
        ? await deps.findRegistrationById(metadataRegistrationId)
        : null;

    if (registration && registration.status === "PENDING") {
      await deps.updateRegistrationStatus(registration.id, "CONFIRMED");
      await deps.enqueueNotification({
        type: "REGISTRATION_CONFIRMED",
        toEmail: "noreply@localhost",
        payload: { registrationId: registration.id },
        dedupeKey: `registration-confirmed:${registration.id}`,
      });
    }

    const artworkOrderId = metadata?.artworkOrderId;
    if (artworkOrderId && event.data.object.id) {
      const artworkOrder = await deps.findArtworkOrderBySessionId(event.data.object.id);
      if (artworkOrder && artworkOrder.status === "PENDING") {
        await deps.confirmArtworkOrder(
          artworkOrder.id,
          artworkOrder.artworkId,
          typeof event.data.object.payment_intent === "string"
            ? event.data.object.payment_intent
            : null,
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
