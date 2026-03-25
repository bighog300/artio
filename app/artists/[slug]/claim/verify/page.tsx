import { unstable_noStore as noStore } from "next/cache";
import { handleArtistClaimVerify } from "@/lib/artist-claim-verify";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyArtistClaimPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string }> }) {
  noStore();
  const { slug } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <main className="mx-auto max-w-2xl p-6"><p>This link has expired or is invalid.</p></main>;
  }

  const result = await handleArtistClaimVerify(slug, token, {
    appDb: db,
    notify: enqueueNotification,
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      {result.ok ? <p>Your claim is under review. We&apos;ll notify you when approved.</p> : <p>This link has expired or is invalid.</p>}
    </main>
  );
}
