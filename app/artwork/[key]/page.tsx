import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";
import { ArtworkPurchaseCard } from "@/components/artwork/artwork-enquire-card";
import { ArtworkRelatedSection } from "@/components/artwork/artwork-related-section";
import { SaveArtworkButton } from "@/components/artwork/save-artwork-button";
import { FollowButton } from "@/components/follows/follow-button";
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
  title: "Artwork | Artio",
  description: "Discover original artworks by independent artists on Artio.",
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
  const title = `${artwork.title} by ${artwork.artist.name} | Artio`;
  const description =
    (artwork.description ?? "").trim().slice(0, 160) ||
    `An artwork by ${artwork.artist.name} on Artio.`;
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
      condition: true,
      conditionNotes: true,
      provenance: true,
      editionInfo: true,
      frameIncluded: true,
      shippingNotes: true,
      priceAmount: true,
      currency: true,
      soldAt: true,
      isPublished: true,
      deletedAt: true,
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
          user: { select: { email: true } },
          stripeAccount: {
            select: {
              chargesEnabled: true,
              status: true,
            },
          },
        },
      },
      featuredAsset: { select: { url: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, alt: true, asset: { select: { url: true } } },
      },
      venues: { select: { venue: { select: { id: true, name: true, slug: true } } } },
      events: { select: { event: { select: { id: true, title: true, slug: true, startAt: true } } } },
      offers: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { offerAmount: true },
      },
    },
  });

  if (!artwork || !artwork.isPublished) notFound();
  if (shouldRedirectArtworkIdKey(key, artwork.slug)) permanentRedirect(`/artwork/${artwork.slug}`);

  const user = await getSessionUser();
  const [initialSaved, initialFollowing, artistFollowersCount] = await Promise.all([
    user
      ? db.favorite.findUnique({
        where: {
          userId_targetType_targetId: { userId: user.id, targetType: "ARTWORK", targetId: artwork.id },
        },
        select: { id: true },
      }).then(Boolean)
      : Promise.resolve(false),
    user
      ? db.follow.findUnique({
        where: {
          userId_targetType_targetId: { userId: user.id, targetType: "ARTIST", targetId: artwork.artist.id },
        },
        select: { id: true },
      }).then(Boolean)
      : Promise.resolve(false),
    db.follow.count({ where: { targetType: "ARTIST", targetId: artwork.artist.id } }),
  ]);

  const cover = resolveImageUrl(artwork.featuredAsset?.url, artwork.images[0]?.asset?.url);
  const metadataChips = [
    artwork.year ? String(artwork.year) : null,
    artwork.medium,
    artwork.dimensions,
  ].filter(Boolean) as string[];
  const hasMarketplaceDetails = Boolean(
    artwork.condition ||
    artwork.conditionNotes ||
    artwork.provenance ||
    artwork.editionInfo ||
    artwork.frameIncluded !== null ||
    artwork.shippingNotes
  );

  const galleryImages = artwork.images
    .filter((image) => Boolean(image.asset?.url))
    .map((image) => ({ id: image.id, src: image.asset.url ?? "", alt: image.alt ?? artwork.title }));

  const venueIds = Array.from(new Set(artwork.venues.map((entry) => entry.venue.id)));
  const eventIds = Array.from(new Set(artwork.events.map((entry) => entry.event.id)));

  const venueChips = artwork.venues.map((v) => ({ label: v.venue.name, href: `/venues/${v.venue.slug}` }));
  const eventChips = artwork.events.map((e) => ({ label: e.event.title, href: `/events/${e.event.slug}` }));
  const hasProvenance = venueChips.length > 0 || eventChips.length > 0;

  const [venueRelatedArtworksByVenue, eventRelatedArtworksByEvent] = await Promise.all([
    Promise.all(venueIds.slice(0, 2).map((venueId) => listPublishedArtworksByVenue(venueId, 6))),
    Promise.all(eventIds.slice(0, 2).map((eventId) => listPublishedArtworksByEvent(eventId, 6))),
  ]);

  const dedupeRelated = (items: PublishedArtworkListItem[]) =>
    Array.from(new Map(items.filter((item) => item.id !== artwork.id).map((item) => [item.id, item])).values());
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
        primaryAction={
          <div className="flex items-center gap-2">
            <SaveArtworkButton artworkId={artwork.id} initialSaved={initialSaved} signedIn={Boolean(user)} />
            <FollowButton
              targetType="ARTIST"
              targetId={artwork.artist.id}
              initialIsFollowing={initialFollowing}
              initialFollowersCount={artistFollowersCount}
              isAuthenticated={Boolean(user)}
              analyticsSlug={artwork.artist.slug}
            />
          </div>
        }
        meta={
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {metadataChips.map((chip) => <Badge key={chip} variant="secondary">{chip}</Badge>)}
            </div>
            {hasProvenance && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Shown at:</span>
                {venueChips.map((chip) => (
                  <Link key={chip.href} href={chip.href} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{chip.label}</Link>
                ))}
                {eventChips.map((chip) => (
                  <Link key={chip.href} href={chip.href} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{chip.label}</Link>
                ))}
              </div>
            )}
          </div>
        }
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

      {hasMarketplaceDetails ? (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {artwork.condition ? (
                <div>
                  <dt className="font-medium">Condition</dt>
                  <dd className="text-muted-foreground">{artwork.condition}</dd>
                </div>
              ) : null}
              {artwork.conditionNotes ? (
                <div>
                  <dt className="font-medium">Condition notes</dt>
                  <dd className="whitespace-pre-wrap text-muted-foreground">{artwork.conditionNotes}</dd>
                </div>
              ) : null}
              {artwork.provenance ? (
                <div>
                  <dt className="font-medium">Provenance</dt>
                  <dd className="whitespace-pre-wrap text-muted-foreground">{artwork.provenance}</dd>
                </div>
              ) : null}
              {artwork.editionInfo ? (
                <div>
                  <dt className="font-medium">Edition</dt>
                  <dd className="text-muted-foreground">{artwork.editionInfo}</dd>
                </div>
              ) : null}
              {artwork.frameIncluded !== null ? (
                <div>
                  <dt className="font-medium">Frame included</dt>
                  <dd className="text-muted-foreground">{artwork.frameIncluded ? "Yes" : "No"}</dd>
                </div>
              ) : null}
              {artwork.shippingNotes ? (
                <div>
                  <dt className="font-medium">Shipping notes</dt>
                  <dd className="whitespace-pre-wrap text-muted-foreground">{artwork.shippingNotes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {artwork.priceAmount != null && artwork.currency ? (
        <ArtworkPurchaseCard
          artworkKey={artwork.slug ?? artwork.id}
          artworkTitle={artwork.title}
          priceFormatted={formatPrice(artwork.priceAmount, artwork.currency)}
          artistName={artwork.artist.name}
          artistStripeReady={
            artwork.artist.stripeAccount?.status === "ACTIVE" &&
            artwork.artist.stripeAccount?.chargesEnabled === true
          }
          isSold={artwork.soldAt !== null}
          priceAmount={artwork.priceAmount}
          currency={artwork.currency}
          initialOfferAmountMajor={artwork.offers[0] ? artwork.offers[0].offerAmount / 100 : undefined}
        />
      ) : null}

      {galleryImages.length > 0 ? <EventGalleryLightbox images={galleryImages} /> : null}

      <ArtworkRelatedSection
        title="Artworks shown at related venues"
        subtitle="Other published works seen at venues where this artwork appeared."
        items={venueRelatedArtworks}
        viewAllHref={artwork.venues[0] ? `/artwork?venueId=${artwork.venues[0].venue.id}` : undefined}
        showArtistName
      />
      <ArtworkRelatedSection
        title="Artworks from related events"
        subtitle="Other published works linked to events featuring this artwork."
        items={eventRelatedArtworks}
        viewAllHref={artwork.events[0] ? `/artwork?eventId=${artwork.events[0].event.id}` : undefined}
        showArtistName
      />
    </PageShell>
  );
}
