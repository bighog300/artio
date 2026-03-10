import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { db } from "@/lib/db";

async function getStripeStatus(userId: string) {
  const artist = await db.artist.findUnique({
    where: { userId },
    select: {
      stripeAccount: {
        select: { status: true, chargesEnabled: true },
      },
    },
  });

  return {
    connected: artist?.stripeAccount?.status === "ACTIVE",
    chargesEnabled: artist?.stripeAccount?.chargesEnabled ?? false,
    status: artist?.stripeAccount?.status ?? null,
  };
}

export default async function ArtistStripeReturnPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/artist/stripe/return");

  const status = await getStripeStatus(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Stripe onboarding</h1>
      {status.chargesEnabled ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">Success — your Stripe account is connected and can accept charges.</p>
      ) : (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">Your onboarding details were submitted, but your account is still under review.</p>
      )}
      <Link className="underline" href="/my/artist">Back to artist dashboard</Link>
    </main>
  );
}
