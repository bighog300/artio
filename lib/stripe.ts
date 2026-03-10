import { getSiteSettings } from "@/lib/site-settings/get-site-settings";

export type StripeWebhookEvent = {
  type: string;
  data: {
    object: {
      id?: string;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      deleted?: boolean;
      payment_intent?: string | null;
      metadata?: { registrationId?: string; artworkOrderId?: string };
    };
  };
};

type StripeClient = {
  accounts: {
    create: (args: { type: "express" }) => Promise<{ id: string }>;
  };
  accountLinks: {
    create: (args: { account: string; refresh_url: string; return_url: string; type: "account_onboarding" }) => Promise<{ url: string }>;
  };
  checkout: {
    sessions: {
      create: (args: {
        payment_method_types: ["card"];
        line_items: Array<{
          price_data: {
            currency: string;
            product_data: { name: string };
            unit_amount: number;
          };
          quantity: number;
        }>;
        application_fee_amount: number;
        transfer_data: { destination: string };
        customer_email: string;
        metadata: { registrationId: string; confirmationCode: string } | { artworkOrderId: string };
        success_url: string;
        cancel_url: string;
        mode: "payment";
      }) => Promise<{ id: string; url: string | null }>;
      retrieve: (id: string) => Promise<{
        payment_status: string;
        amount_total?: number | null;
        metadata?: { registrationId?: string; confirmationCode?: string };
      } | null>;
    };
  };
  refunds: {
    create: (args: { payment_intent: string; amount?: number }) => Promise<{ amount: number }>;
  };
  webhooks: {
    constructEvent: (payload: string, signature: string, secret: string) => StripeWebhookEvent;
  };
};

type StripeConstructor = new (apiKey: string) => StripeClient;

let cachedSecretKey: string | null = null;
let cachedClient: StripeClient | null = null;

async function loadStripeConstructor(): Promise<StripeConstructor> {
  const dynamicImport = new Function("m", "return import(m)") as (moduleName: string) => Promise<{ default?: unknown }>;
  const stripeModule = await dynamicImport("stripe");
  if (typeof stripeModule.default !== "function") {
    throw new Error("stripe_unavailable");
  }

  return stripeModule.default as StripeConstructor;
}

export async function getStripeClient(): Promise<StripeClient> {
  const settings = await getSiteSettings();
  const stripeSecretKey = settings.stripeSecretKey?.trim();
  if (!stripeSecretKey) {
    throw new Error("Stripe secret key is not configured in SiteSettings");
  }

  if (cachedClient && cachedSecretKey === stripeSecretKey) {
    return cachedClient;
  }

  const Stripe = await loadStripeConstructor();
  cachedSecretKey = stripeSecretKey;
  cachedClient = new Stripe(stripeSecretKey);
  return cachedClient;
}
