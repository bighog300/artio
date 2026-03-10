import { apiError } from "@/lib/api";
import { AuthError, getSessionUser, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { handlePostArtistStripeConnect } from "@/lib/stripe-connect-route";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) throw new AuthError();

    const artist = await db.artist.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!artist) return apiError(404, "not_found", "Artist profile not found");

    return await handlePostArtistStripeConnect(artist.id, {
      findArtistStripeAccount: (artistId) => db.artistStripeAccount.findUnique({
        where: { artistId },
        select: { stripeAccountId: true, status: true, chargesEnabled: true, payoutsEnabled: true },
      }),
      createArtistStripeAccount: (input) => db.artistStripeAccount.create({ data: input }),
      createExpressAccount: async () => {
        const stripe = await getStripeClient();
        return stripe.accounts.create({ type: "express" });
      },
      createAccountLink: async ({ account, refreshUrl, returnUrl }) => {
        const stripe = await getStripeClient();
        return stripe.accountLinks.create({
          account,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: "account_onboarding",
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
