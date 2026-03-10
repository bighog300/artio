import { NextResponse } from "next/server";
import { StripeAccountStatus } from "@prisma/client";
import { apiError } from "@/lib/api";
import { venueIdParamSchema, zodDetails } from "@/lib/validators";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type StripeConnectDeps = {
  requireVenueRole: (venueId: string, role: "EDITOR" | "OWNER") => Promise<unknown>;
  findVenueStripeAccount: (venueId: string) => Promise<{ stripeAccountId: string; status: StripeAccountStatus; chargesEnabled: boolean; payoutsEnabled: boolean } | null>;
  createVenueStripeAccount: (input: { venueId: string; stripeAccountId: string; status: StripeAccountStatus }) => Promise<unknown>;
  createExpressAccount: () => Promise<{ id: string }>;
  createAccountLink: (input: { account: string; refreshUrl: string; returnUrl: string }) => Promise<{ url: string }>;
  appUrl?: string;
};

function resolveAppUrl(appUrl?: string) {
  return (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function handlePostVenueStripeConnect(params: Promise<{ id: string }>, deps: StripeConnectDeps) {
  const parsedId = venueIdParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const venueId = parsedId.data.id;
  await deps.requireVenueRole(venueId, "OWNER");

  const existing = await deps.findVenueStripeAccount(venueId);
  if (existing?.status === "ACTIVE") {
    return apiError(400, "already_connected", "Venue already connected to Stripe");
  }

  const stripeAccountId = existing?.stripeAccountId ?? (await deps.createExpressAccount()).id;

  if (!existing) {
    await deps.createVenueStripeAccount({
      venueId,
      stripeAccountId,
      status: "PENDING",
    });
  }

  const appUrl = resolveAppUrl(deps.appUrl);
  const accountLink = await deps.createAccountLink({
    account: stripeAccountId,
    refreshUrl: `${appUrl}/my/venues/${venueId}/stripe/refresh`,
    returnUrl: `${appUrl}/my/venues/${venueId}/stripe/return`,
  });

  return NextResponse.json({ url: accountLink.url }, { headers: NO_STORE_HEADERS });
}

type StripeStatusDeps = {
  requireVenueRole: (venueId: string, role: "EDITOR" | "OWNER") => Promise<unknown>;
  findVenueStripeAccount: (venueId: string) => Promise<{ status: StripeAccountStatus; chargesEnabled: boolean; payoutsEnabled: boolean } | null>;
};

export async function handleGetVenueStripeStatus(params: Promise<{ id: string }>, deps: StripeStatusDeps) {
  const parsedId = venueIdParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  await deps.requireVenueRole(parsedId.data.id, "EDITOR");
  const stripeAccount = await deps.findVenueStripeAccount(parsedId.data.id);

  return NextResponse.json({
    connected: stripeAccount?.status === "ACTIVE",
    status: stripeAccount?.status ?? null,
    chargesEnabled: stripeAccount?.chargesEnabled ?? false,
    payoutsEnabled: stripeAccount?.payoutsEnabled ?? false,
  }, { headers: NO_STORE_HEADERS });
}

export async function handlePostArtistStripeConnect(
  artistId: string,
  deps: {
    findArtistStripeAccount: (artistId: string) => Promise<{ stripeAccountId: string; status: StripeAccountStatus; chargesEnabled: boolean; payoutsEnabled: boolean } | null>;
    createArtistStripeAccount: (input: { artistId: string; stripeAccountId: string; status: StripeAccountStatus }) => Promise<unknown>;
    createExpressAccount: () => Promise<{ id: string }>;
    createAccountLink: (input: { account: string; refreshUrl: string; returnUrl: string }) => Promise<{ url: string }>;
    appUrl?: string;
  },
): Promise<Response> {
  const existing = await deps.findArtistStripeAccount(artistId);
  if (existing?.status === "ACTIVE") {
    return apiError(400, "already_connected", "Artist already connected to Stripe");
  }

  const stripeAccountId = existing?.stripeAccountId ?? (await deps.createExpressAccount()).id;

  if (!existing) {
    await deps.createArtistStripeAccount({
      artistId,
      stripeAccountId,
      status: "PENDING",
    });
  }

  const appUrl = resolveAppUrl(deps.appUrl);
  const accountLink = await deps.createAccountLink({
    account: stripeAccountId,
    refreshUrl: `${appUrl}/my/artist/stripe/refresh`,
    returnUrl: `${appUrl}/my/artist/stripe/return`,
  });

  return NextResponse.json({ url: accountLink.url }, { headers: NO_STORE_HEADERS });
}

export async function handleGetArtistStripeStatus(
  artistId: string,
  deps: {
    findArtistStripeAccount: (artistId: string) => Promise<{ status: StripeAccountStatus; chargesEnabled: boolean; payoutsEnabled: boolean } | null>;
  },
): Promise<Response> {
  const stripeAccount = await deps.findArtistStripeAccount(artistId);

  return NextResponse.json({
    connected: stripeAccount?.status === "ACTIVE",
    status: stripeAccount?.status ?? null,
    chargesEnabled: stripeAccount?.chargesEnabled ?? false,
    payoutsEnabled: stripeAccount?.payoutsEnabled ?? false,
  }, { headers: NO_STORE_HEADERS });
}
