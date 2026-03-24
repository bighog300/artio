import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityAboutCard } from "@/components/entities/entity-about-card";
import { EntityHeader } from "@/components/entities/entity-header";
import { EntityTabs } from "@/components/entities/entity-tabs";
import { EventCard } from "@/components/events/event-card";
import { FollowButton } from "@/components/follows/follow-button";
import { VenueEventsGrid } from "@/components/venues/venue-events-grid";
import { VenueArtistsSection } from "@/components/venues/venue-artists-section";
import { VenueUpcomingMapShell } from "@/components/venues/venue-upcoming-map-shell";
import { ArtworkRelatedSection } from "@/components/artwork/artwork-related-section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";
import { SectionHeader } from "@/components/ui/section-header";
import { ContextualNudgeSlot } from "@/components/onboarding/contextual-nudge-slot";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { buildVenueJsonLd, getDetailUrl } from "@/lib/seo.public-profiles";
import { getVenueDescriptionExcerpt } from "@/lib/venues";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { ArtworkCountBadge } from "@/components/artwork/artwork-count-badge";
import { shouldShowVenueClaimCta } from "@/lib/venue-claims/cta";
import { dedupeAssociatedArtists } from "@/lib/venue-associated-artists";

import Link from "next/link";
import { countPublishedArtworksByVenue, listPublishedArtworksByVenue } from "@/lib/artworks";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!hasDatabaseUrl()) return { title: "Venue | Artio", description: "Discover venue details and upcoming events on Artio." };
  const venue = await db.venue.findFirst({ where: { slug, isPublished: true, deletedAt: null }, select: { name: true, description: true, featuredImageUrl: true, featuredAsset: { select: { url: true } } } });
  if (!venue) return { title: "Venue | Artio", description: "Discover venue details and upcoming events on Artio." };
  const imageUrl = resolveEntityPrimaryImage(venue)?.url ?? null;
  return { title: `${venue.name} | Artio`, description: getVenueDescriptionExcerpt(venue.description, `Explore ${venue.name} on Artio.`), openGraph: { title: `${venue.name} | Artio`, description: getVenueDescriptionExcerpt(venue.description, `Explore ${venue.name} on Artio.`), images: imageUrl ? [{ url: imageUrl, alt: venue.name }] : undefined } };
}

export default async function VenueDetail({ params }: { params: Promise<{ slug: string }> }) {
  if (!hasDatabaseUrl()) return <main className="p-6">Set DATABASE_URL to view venues locally.</main>;

  const { slug } = await params;
  const now = new Date();
  const user = await getSessionUser();

  const venue = await db.venue.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      websiteUrl: true,
      addressLine1: true,
      city: true,
      region: true,
      country: true,
      lat: true,
      lng: true,
      claimStatus: true,
      aiGenerated: true,
      _count: { select: { memberships: true } },
      featuredImageUrl: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
      events: {
        where: { isPublished: true, deletedAt: null, startAt: { gte: now } },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 24,
        select: {
          id: true,
          title: true,
          slug: true,
          startAt: true,
          endAt: true,
          images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
          eventTags: { select: { tag: { select: { slug: true } } } },
          eventArtists: {
            select: {
              artist: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  avatarImageUrl: true,
                  featuredImageUrl: true,
                  images: {
                    take: 1,
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                    select: {
                      url: true,
                      alt: true,
                      sortOrder: true,
                      isPrimary: true,
                      width: true,
                      height: true,
                      asset: { select: { url: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      artistAssociations: {
        where: { status: "APPROVED" },
        select: {
          artistId: true,
          role: true,
          artist: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarImageUrl: true,
              featuredImageUrl: true,
              images: {
                take: 1,
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: {
                  url: true,
                  alt: true,
                  sortOrder: true,
                  isPrimary: true,
                  width: true,
                  height: true,
                  asset: { select: { url: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!venue) notFound();

  const [followersCount, existingFollow, existingMembership, artworks, artworkCount, pastEventsRaw] = await Promise.all([
    db.follow.count({ where: { targetType: "VENUE", targetId: venue.id } }),
    user ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "VENUE", targetId: venue.id } }, select: { id: true } }) : Promise.resolve(null),
    user ? db.venueMembership.findUnique({ where: { userId_venueId: { userId: user.id, venueId: venue.id } }, select: { id: true } }) : Promise.resolve(null),
    listPublishedArtworksByVenue(venue.id, 6),
    countPublishedArtworksByVenue(venue.id),
    db.event.findMany({
      where: { venueId: venue.id, isPublished: true, deletedAt: null, endAt: { lt: now } },
      orderBy: [{ startAt: "desc" }],
      take: 24,
      select: {
        id: true,
        title: true,
        slug: true,
        startAt: true,
        endAt: true,
        images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
        eventTags: { select: { tag: { select: { slug: true } } } },
      },
    }),
  ]);

  const cover = resolveEntityPrimaryImage(venue);
  const coverUrl = cover?.url ?? null;
  const subtitle = [venue.city, venue.region, venue.country].filter(Boolean).join(", ") || "Venue profile";
  const address = [venue.addressLine1, venue.city, venue.region, venue.country].filter(Boolean).join(", ");
  const mapHref = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  const directionsUrl = `https://maps.google.com/?q=${encodeURIComponent([venue.addressLine1, venue.city, venue.country].filter(Boolean).join(", "))}`;

  const events = venue.events.map((event) => {
    const image = resolveEntityPrimaryImage(event);
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      startAt: event.startAt,
      endAt: event.endAt,
      imageUrl: image?.url ?? null,
      image,
      imageAlt: image?.alt ?? event.title,
      tags: event.eventTags.map(({ tag }) => tag.slug),
    };
  });

  const pastEvents = pastEventsRaw.map((event) => {
    const image = resolveEntityPrimaryImage(event);
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      startAt: event.startAt,
      endAt: event.endAt,
      imageUrl: image?.url ?? null,
      image,
      imageAlt: image?.alt ?? event.title,
      tags: event.eventTags.map(({ tag }) => tag.slug),
    };
  });

  const verifiedAssociations = venue.artistAssociations.map((a) => ({
    artistId: a.artistId,
    role: a.role,
    artist: a.artist,
  }));

  const eventDerivedArtists = Array.from(
    new Map(
      venue.events
        .flatMap((e) => e.eventArtists ?? [])
        .filter((a) => a.artist != null)
        .map((a) => [a.artist.id, { artistId: a.artist.id, role: null, artist: a.artist }]),
    ).values(),
  );

  const { verifiedArtists, derivedArtists } = dedupeAssociatedArtists(
    verifiedAssociations,
    eventDerivedArtists,
  );

  const showClaimCta = shouldShowVenueClaimCta({
    claimStatus: venue.claimStatus,
    aiGenerated: venue.aiGenerated,
    membershipsCount: venue._count.memberships,
    isCurrentUserMember: Boolean(existingMembership),
  });

  const detailUrl = getDetailUrl("venue", slug);
  const jsonLd = buildVenueJsonLd({ name: venue.name, description: venue.description, detailUrl, imageUrl: coverUrl, websiteUrl: venue.websiteUrl, address: venue.addressLine1 });

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="entity_viewed" props={{ type: "venue", slug }} />
      <EntityPageViewTracker entityType="VENUE" entityId={venue.id} />
      {showClaimCta ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Own or run this venue? <Link className="underline" href={`/venues/${venue.slug}/claim`}>Claim this venue</Link>.
        </div>
      ) : null}
      <EntityHeader
        title={venue.name}
        subtitle={subtitle}
        image={cover}
        imageUrl={coverUrl}
        coverImage={cover}
        coverUrl={coverUrl}
        primaryAction={<FollowButton targetType="VENUE" targetId={venue.id} initialIsFollowing={Boolean(existingFollow)} initialFollowersCount={followersCount} isAuthenticated={Boolean(user)} analyticsSlug={venue.slug} />}
        secondaryAction={mapHref ? <a className="inline-flex rounded-md border px-3 py-1 text-sm" href={mapHref} target="_blank" rel="noreferrer">Open in Maps</a> : undefined}
        meta={<ArtworkCountBadge count={artworkCount} href={`/artwork?venueId=${venue.id}`} />}
      />

            {Boolean(user) ? <ContextualNudgeSlot page="venue_detail" type="entity_save_search" nudgeId="nudge_entity_save_search" title="Turn this into alerts" body="Save a search like this to get weekly updates." destination={`/search?q=${encodeURIComponent(venue.name)}`} /> : null}

      <EntityTabs
        upcoming={(
          <section className="space-y-3">
            <SectionHeader title="Upcoming events" subtitle="What’s happening at this venue next." />
            {venue.lat != null && venue.lng != null ? (
              <div className="space-y-3">
                <div className="mb-6 overflow-hidden rounded-xl border" style={{ height: "12rem" }}>
                  <VenueUpcomingMapShell lat={venue.lat} lng={venue.lng} venueId={venue.id} venueSlug={venue.slug} venueName={venue.name} city={venue.city} />
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    Get Directions
                  </Link>
                </Button>
              </div>
            ) : null}
            {events.length === 0 ? <EmptyState title="No upcoming events" description="Follow this venue and check back soon." /> : (
              <VenueEventsGrid events={events} venueName={venue.name} />
            )}
            <ArtworkRelatedSection title="Artworks shown here" subtitle="Published works linked to this venue." items={artworks} viewAllHref={artworkCount > 6 ? `/artwork?venueId=${venue.id}` : undefined} showArtistName />
          </section>
        )}
        past={(
          <section className="space-y-3">
            <SectionHeader title="Past events" subtitle="What has happened at this venue." />
            {pastEvents.length === 0 ? <EmptyState title="No past events" description="No past events to show." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pastEvents.map((event) => <EventCard key={event.id} href={`/events/${event.slug}`} title={event.title} startAt={event.startAt} endAt={event.endAt} venueName={venue.name} venueSlug={venue.slug} image={event.image} imageUrl={event.imageUrl} imageAlt={event.imageAlt} tags={event.tags} />)}
              </div>
            )}
          </section>
        )}
        artists={
          verifiedArtists.length > 0 || derivedArtists.length > 0
            ? <VenueArtistsSection verifiedArtists={verifiedArtists} derivedArtists={derivedArtists} />
            : undefined
        }
        about={<EntityAboutCard description={venue.description} websiteUrl={venue.websiteUrl} address={address || null} mapHref={mapHref} />}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </PageShell>
  );
}
