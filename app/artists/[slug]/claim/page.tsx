import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ClaimArtistForm } from "./artist-claim-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArtistClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  noStore();
  const { slug } = await params;

  const artist = await db.artist.findUnique({ where: { slug, isPublished: true }, select: { id: true, name: true, slug: true, userId: true, deletedAt: true } });
  if (!artist || artist.deletedAt) redirect("/artists");
  if (artist.userId) redirect(`/artists/${artist.slug}`);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Claim {artist.name}</h1>
      <h2 className="text-lg font-medium">This is my profile</h2>
      <p className="text-sm text-muted-foreground">Tell us who you are and we&apos;ll send a verification link to your email.</p>
      <ClaimArtistForm slug={artist.slug} />
      <p className="text-xs text-muted-foreground"><Link href={`/artists/${artist.slug}`} className="underline">Back to artist</Link></p>
    </main>
  );
}
