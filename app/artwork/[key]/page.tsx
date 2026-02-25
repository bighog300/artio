import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { resolveImageUrl } from "@/lib/assets";
import { isArtworkIdKey, shouldRedirectArtworkIdKey } from "@/lib/artwork-route";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";

export default async function ArtworkDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const isIdLookup = isArtworkIdKey(key);

  const artwork = await db.artwork.findFirst({
    where: isIdLookup ? { id: key, deletedAt: null } : { slug: key, deletedAt: null },
    include: { artist: true, featuredAsset: true, images: { include: { asset: true }, orderBy: { sortOrder: "asc" } }, venues: { include: { venue: true } }, events: { include: { event: true } } },
  });

  if (!artwork || !artwork.isPublished) notFound();
  if (shouldRedirectArtworkIdKey(key, artwork.slug)) permanentRedirect(`/artwork/${artwork.slug}`);

  const cover = resolveImageUrl(artwork.featuredAsset?.url, artwork.images[0]?.asset?.url);

  return <main className="space-y-4 p-6"><EntityPageViewTracker entityType="ARTWORK" entityId={artwork.id} /><h1 className="text-2xl font-semibold">{artwork.title}</h1><p className="text-sm text-muted-foreground">by <Link className="underline" href={`/artists/${artwork.artist.slug}`}>{artwork.artist.name}</Link></p>{cover ? <div className="relative h-80 w-full overflow-hidden rounded border"><Image src={cover} alt={artwork.title} fill className="object-cover" /></div> : null}<p>{artwork.description}</p><p className="text-sm">{artwork.year ?? ""} {artwork.medium ?? ""} {artwork.dimensions ?? ""}</p><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{artwork.images.map((image) => <div key={image.id} className="relative h-32 overflow-hidden rounded border"><Image src={image.asset.url} alt={image.alt ?? artwork.title} fill className="object-cover" /></div>)}</div><div className="text-sm">Venues: {artwork.venues.map((v) => v.venue.name).join(", ") || "None"}</div><div className="text-sm">Events: {artwork.events.map((e) => e.event.title).join(", ") || "None"}</div></main>;
}
