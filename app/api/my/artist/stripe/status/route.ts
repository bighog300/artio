import { apiError } from "@/lib/api";
import { AuthError, getSessionUser, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleGetArtistStripeStatus } from "@/lib/stripe-connect-route";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new AuthError();

    const artist = await db.artist.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!artist) return apiError(404, "not_found", "Artist profile not found");

    return await handleGetArtistStripeStatus(artist.id, {
      findArtistStripeAccount: (artistId) => db.artistStripeAccount.findUnique({
        where: { artistId },
        select: { status: true, chargesEnabled: true, payoutsEnabled: true },
      }),
    });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
