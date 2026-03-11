import { unstable_noStore as noStore } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyArtistClaimPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string }> }) {
  noStore();
  const { slug } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <main className="mx-auto max-w-2xl p-6"><p>This link has expired or is invalid.</p></main>;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/artists/${encodeURIComponent(slug)}/claim/verify?token=${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" });

  return (
    <main className="mx-auto max-w-2xl p-6">
      {response.ok ? <p>Your claim is under review. We&apos;ll notify you when approved.</p> : <p>This link has expired or is invalid.</p>}
    </main>
  );
}
