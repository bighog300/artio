import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";
import { ArtworkRelatedSection } from "@/components/artwork/artwork-related-section";
import { SaveArtworkButton } from "@/components/artwork/save-artwork-button";
import { EntityHeader } from "@/components/entities/entity-header";
import { EventGalleryLightbox } from "@/components/events/event-gallery-lightbox";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { resolveImageUrl } from "@/lib/assets";
import { isArtworkIdKey, shouldRedirectArtworkIdKey } from "@/lib/artwork-route";
import { listPublishedArtworksByEvent, listPublishedArtworksByVenue, type PublishedArtworkListItem } from "@/lib/artworks";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { buildArtworkJsonLd, getSiteUrl } from "@/lib/seo.public-profiles";


const FALLBACK_METADATA: Metadata = {
  title: "Artwork | Artpulse",
  description: "Discover original artworks by independent artists on Artpulse.",
};

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const isIdLookup = isArtworkIdKey(key);
  const artwork = await db.artwork.findFirst({
    where: isIdLookup
      ? { id: key, isPublished: true, deletedAt: null }
      : { slug: key, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      artist: { select: { name: true } },
      featuredAsset: { select: { url: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { asset: { select: { url: true } } } },
    },
  });
  if (!artwork) return FALLBACK_METADATA;
  const title = `${artwork.title} by ${artwork.artist.name} | Artpulse`;
  const description =
    (artwork.description ?? "").trim().slice(0, 160) ||
    `An artwork by ${artwork.artist.name} on Artpulse.`;
  const imageUrl = artwork.featuredAsset?.url ?? artwork.images[0]?.asset?.url ?? null;
  const url = `${getSiteUrl()}/artwork/${artwork.slug ?? artwork.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: imageUrl ? [{ url: imageUrl, alt: artwork.title }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: imageUrl ? [imageUrl] : undefined },
  };
}

export default async function ArtworkDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const isIdLookup = isArtworkIdKey(key);

  const artwork = await db.artwork.findFirst({
    where: isIdLookup ? { id: key, deletedAt: null } : { slug: key, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      year: true,
      medium: true,
      dimensions: true,
      priceAmount: true,
      currency: true,
      isPublished: true,
      deletedAt: true,
      artist: { select: { name: true, slug: true } },
      featuredAsset: { select: { url: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, alt: true, asset: { select: { url: true } } },
      },
      venues: { select: { venueId: true } },
      events: { select: { eventId: true } },
    },
  });

  if (!artwork || !artwork.isPublished) notFound();
  if (shouldRedirectArtworkIdKey(key, artwork.slug)) permanentRedirect(`/artwork/${artwork.slug}`);

  const user = await getSessionUser();
  const initialSaved = user
    ? Boolean(await db.favorite.findUnique({
      where: {
        userId_targetType_targetId: { userId: user.id, targetType: "ARTWORK", targetId: artwork.id },
      },
      select: { id: true },
    }))
    : false;

  const cover = resolveImageUrl(artwork.featuredAsset?.url, artwork.images[0]?.asset?.url);
  const metadataChips = [
    artwork.year ? String(artwork.year) : null,
    artwork.medium,
    artwork.dimensions,
    artwork.priceAmount != null && artwork.currency
      ? formatPrice(artwork.priceAmount, artwork.currency)
      : null,
  ].filter(Boolean) as string[];
  const galleryImages = artwork.images
    .filter((image) => Boolean(image.asset?.url))
    .map((image) => ({ id: image.id, src: image.asset.url ?? "", alt: image.alt ?? artwork.title }));

  const venueIds = Array.from(new Set(artwork.venues.map((entry) => entry.venueId)));
  const eventIds = Array.from(new Set(artwork.events.map((entry) => entry.eventId)));

  const [venueRelatedArtworksByVenue, eventRelatedArtworksByEvent] = await Promise.all([
    Promise.all(venueIds.slice(0, 2).map((venueId) => listPublishedArtworksByVenue(venueId, 6))),
    Promise.all(eventIds.slice(0, 2).map((eventId) => listPublishedArtworksByEvent(eventId, 6))),
  ]);

  const dedupeRelated = (items: PublishedArtworkListItem[]) => Array.from(new Map(items.filter((item) => item.id !== artwork.id).map((item) => [item.id, item])).values());
  const venueRelatedArtworks = dedupeRelated(venueRelatedArtworksByVenue.flat()).slice(0, 6);
  const eventRelatedArtworks = dedupeRelated(eventRelatedArtworksByEvent.flat()).slice(0, 6);
  const artworkJsonLd = buildArtworkJsonLd({
    title: artwork.title,
    artistName: artwork.artist.name,
    description: artwork.description,
    detailUrl: `${getSiteUrl()}/artwork/${artwork.slug ?? artwork.id}`,
    imageUrl: cover,
    year: artwork.year,
    medium: artwork.medium,
    priceAmount: artwork.priceAmount,
    currency: artwork.currency,
  });

  return (
    <PageShell className="page-stack">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(artworkJsonLd).replace(/</g, "\\u003c") }}
      />
      <EntityPageViewTracker entityType="ARTWORK" entityId={artwork.id} />
      <Breadcrumbs items={[{ label: "Artworks", href: "/artwork" }, { label: artwork.title, href: `/artwork/${artwork.slug ?? artwork.id}` }]} />
      <EntityHeader
        title={artwork.title}
        subtitle={<span>by <Link className="underline" href={`/artists/${artwork.artist.slug}`}>{artwork.artist.name}</Link></span>}
        imageUrl={cover}
        coverUrl={cover}
        primaryAction={<SaveArtworkButton artworkId={artwork.id} initialSaved={initialSaved} signedIn={Boolean(user)} />}
        meta={<div className="flex flex-wrap gap-2">{metadataChips.map((chip) => <Badge key={chip} variant="secondary">{chip}</Badge>)}</div>}
      />

      {artwork.description ? (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground/90">{artwork.description}</div>
          </CardContent>
        </Card>
      ) : null}

      {galleryImages.length > 0 ? <EventGalleryLightbox images={galleryImages} /> : null}

      <ArtworkRelatedSection title="Artworks shown at related venues" subtitle="Other published works seen at venues where this artwork appeared." items={venueRelatedArtworks} viewAllHref={artwork.venues[0] ? `/artwork?venueId=${artwork.venues[0].venueId}` : undefined} showArtistName />
      <ArtworkRelatedSection title="Artworks from related events" subtitle="Other published works linked to events featuring this artwork." items={eventRelatedArtworks} viewAllHref={artwork.events[0] ? `/artwork?eventId=${artwork.events[0].eventId}` : undefined} showArtistName />
    </PageShell>
  );
}
