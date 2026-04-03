import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { ArtworkDetailClient } from "./page-client";

export const dynamic = "force-dynamic";

export default async function MyArtworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return redirectToLogin(`/my/artwork/${id}`);

  try {
    await requireMyArtworkAccess(id);
  } catch {
    notFound();
  }

  const artwork = await db.artwork.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      year: true,
      medium: true,
      dimensions: true,
      priceAmount: true,
      currency: true,
      featuredAssetId: true,
      isPublished: true,
      deletedAt: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          alt: true,
          assetId: true,
          sortOrder: true,
          asset: { select: { url: true } },
        },
      },
      venues: { select: { venue: { select: { id: true, name: true, slug: true } } } },
      events: { select: { event: { select: { id: true, title: true, slug: true, startAt: true } } } },
    },
  });

  if (!artwork) notFound();

  return (
    <ArtworkDetailClient
      initialArtwork={{
        id: artwork.id,
        title: artwork.title,
        slug: artwork.slug,
        description: artwork.description,
        year: artwork.year,
        medium: artwork.medium,
        dimensions: artwork.dimensions,
        priceAmount: artwork.priceAmount,
        currency: artwork.currency,
        featuredAssetId: artwork.featuredAssetId,
        isPublished: artwork.isPublished,
        deletedAt: artwork.deletedAt?.toISOString() ?? null,
        images: artwork.images.map((img) => ({
          id: img.id,
          alt: img.alt,
          assetId: img.assetId,
          sortOrder: img.sortOrder,
          asset: { url: img.asset.url },
        })),
      }}
      initialVenues={artwork.venues.map((v) => v.venue)}
      initialEvents={artwork.events.map((e) => ({ ...e.event, startAt: e.event.startAt.toISOString() }))}
    />
  );
}
