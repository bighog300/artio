import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import SubmitClaimButton from "./submit-claim-button";
import { getVenueClaimInviteByToken } from "@/lib/venue-claims/service";

type ClaimPageProps = { params: Promise<{ token: string }> };

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { token } = await params;
  const invite = await getVenueClaimInviteByToken({ db: db as never, token });

  if (invite.state !== "valid") {
    const message = invite.state === "expired"
      ? "This claim invitation has expired."
      : invite.state === "claimed"
        ? "This invitation has already been used."
        : "This claim invitation is invalid.";

    return (
      <main className="mx-auto max-w-xl px-6 py-16 space-y-4">
        <h1 className="text-2xl font-semibold">Venue claim</h1>
        <p className="text-muted-foreground">{message}</p>
        <Link className="underline" href="/">Return home</Link>
      </main>
    );
  }

  const session = await getSessionUser();
  if (!session) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 space-y-4">
        <h1 className="text-2xl font-semibold">You&apos;ve been invited to manage this venue</h1>
        <p className="text-lg">{invite.invite.venue?.name}</p>
        <p className="text-sm text-muted-foreground">Sign in to continue and submit your venue claim.</p>
        <Button asChild><Link href={`/login?next=${encodeURIComponent(`/claim/${token}`)}`}>Sign in to continue</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16 space-y-4">
      <h1 className="text-2xl font-semibold">You&apos;ve been invited to manage this venue</h1>
      <p className="text-lg">{invite.invite.venue?.name}</p>
      <p className="text-sm text-muted-foreground">Confirm this request to start claim review by an Artpulse admin.</p>
      <SubmitClaimButton token={token} venueName={invite.invite.venue?.name ?? "this venue"} />
    </main>
  );
}
