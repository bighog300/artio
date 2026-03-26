import Link from "next/link";
import { redirectToLogin } from "@/lib/auth-redirect";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import CvEditorClient from "./cv-editor-client";

export const dynamic = "force-dynamic";

export default async function MyArtistCvPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) redirectToLogin("/my/artist/cv");

  const artist = await db.artist.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      cvEntries: {
        orderBy: [{ entryType: "asc" }, { year: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          entryType: true,
          title: true,
          organisation: true,
          location: true,
          year: true,
          endYear: true,
          description: true,
          url: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!artist) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">CV &amp; history</h1>
        <p className="text-sm text-muted-foreground">Create your artist profile to start building your CV.</p>
        <Link className="text-sm underline" href="/my/artist">Go to artist profile</Link>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">CV &amp; history</h1>
        <p className="text-sm text-muted-foreground">Add exhibitions, residencies, awards, education, and more for your public artist profile.</p>
      </div>
      <CvEditorClient initialEntries={artist.cvEntries} />
    </main>
  );
}
