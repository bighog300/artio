import Link from "next/link";
import { redirectToLogin } from "@/lib/auth-redirect";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import InquiriesClient from "./inquiries-client";

export const dynamic = "force-dynamic";

export default async function MyArtistInquiriesPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) redirectToLogin("/my/artist/inquiries");

  const artist = await db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!artist) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Artist inquiries</h1>
        <p className="text-sm text-muted-foreground">Create your artist profile to view inquiries from buyers.</p>
        <Link className="text-sm underline" href="/my/artist">Go to artist profile</Link>
      </main>
    );
  }

  const inquiries = await db.artworkInquiry.findMany({
    where: { artwork: { artistId: artist.id } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      artworkId: true,
      artwork: { select: { title: true, slug: true } },
      buyerName: true,
      buyerEmail: true,
      message: true,
      readAt: true,
      createdAt: true,
    },
  });

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Artist inquiries</h1>
        <p className="text-sm text-muted-foreground">Manage buyer questions sent from your artwork detail pages.</p>
      </div>
      <InquiriesClient
        initialInquiries={inquiries.map((inquiry) => ({
          ...inquiry,
          createdAt: inquiry.createdAt.toISOString(),
          readAt: inquiry.readAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
