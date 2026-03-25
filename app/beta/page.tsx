import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getBetaConfig, isEmailAllowed } from "@/lib/beta/access";
import { BetaPageClient } from "./beta-page-client";
import { BetaSignOutButton } from "./beta-signout-button";

export default async function BetaPage() {
  const user = await getSessionUser();
  const betaConfig = getBetaConfig();
  const userAllowed = user?.email ? isEmailAllowed(user.email, betaConfig) : false;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-3xl font-semibold">Artio is in private beta</h1>
      {user && !userAllowed ? <p>You’re signed in as {user.email} but don’t have access.</p> : null}
      <p>Please request access below. You can still send feedback during beta.</p>
      <div className="flex gap-3">
        {!user ? <Link className="rounded border px-3 py-2 text-sm" href="/login">Sign in</Link> : null}
        {user ? <BetaSignOutButton /> : null}
      </div>
      <BetaPageClient initialEmail={user?.email ?? ""} requestsEnabled={betaConfig.requestsEnabled} />
    </main>
  );
}
