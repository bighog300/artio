import Link from "next/link";
import { redirectToLogin } from "@/lib/auth-redirect";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateGalleryForm } from "./page-client";

export const dynamic = "force-dynamic";

export default async function MyGalleriesPage() {
  const user = await getSessionUser();
  if (!user) return redirectToLogin("/my/galleries");

  const [galleries, artworks] = await Promise.all([
    db.collection.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true, scheduledPublishAt: true, _count: { select: { items: true, followers: true } } },
    }),
    db.artwork.findMany({ where: { artist: { userId: user.id } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, slug: true, status: true } }),
  ]);

  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">My Galleries</h1>
        <p className="text-sm text-muted-foreground">Create → Preview → Publish. Galleries are powered by your existing Collection model.</p>
      </header>

      <CreateGalleryForm artworks={artworks.map((a) => ({ id: a.id, title: a.title }))} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Existing galleries</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {galleries.map((gallery) => (
            <Link key={gallery.id} href={`/my/galleries/${gallery.id}`} className="rounded border p-3 hover:bg-muted/40">
              <p className="font-medium">{gallery.title}</p>
              <p className="text-xs text-muted-foreground">{gallery._count.items} artworks · {gallery._count.followers} saves</p>
              <p className="text-xs text-muted-foreground">State: {gallery.status}{gallery.scheduledPublishAt ? ` · scheduled ${gallery.scheduledPublishAt.toISOString()}` : ""}</p>
            </Link>
          ))}
          {galleries.length === 0 ? <p className="text-sm text-muted-foreground">No galleries yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
