import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/auth-redirect";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GalleryEditor } from "./page-client";

export const dynamic = "force-dynamic";

export default async function MyGalleryEditorPage({ params }: { params: Promise<{ galleryId: string }> }) {
  const user = await getSessionUser();
  if (!user) return redirectToLogin("/my/galleries");
  const { galleryId } = await params;

  const [gallery, artworks] = await Promise.all([
    db.collection.findFirst({
      where: { id: galleryId, userId: user.id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        publishedAt: true,
        scheduledPublishAt: true,
        items: { where: { entityType: "ARTWORK" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { entityId: true, caption: true, commentary: true, sortOrder: true } },
      },
    }),
    db.artwork.findMany({ where: { artist: { userId: user.id } }, orderBy: { updatedAt: "desc" }, take: 80, select: { id: true, title: true, slug: true } }),
  ]);

  if (!gallery) notFound();

  return <GalleryEditor gallery={gallery} artworks={artworks} />;
}
