import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityAboutCard } from "@/components/entities/entity-about-card";
import { EntityHeader } from "@/components/entities/entity-header";
import { EntityTabs } from "@/components/entities/entity-tabs";
import { EventCard } from "@/components/events/event-card";
import { FollowButton } from "@/components/follows/follow-button";
import { ArtworkRelatedSection } from "@/components/artwork/artwork-related-section";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";
import { SectionHeader } from "@/components/ui/section-header";
import { ContextualNudgeSlot } from "@/components/onboarding/contextual-nudge-slot";
import { ArtistArtworkShowcase } from "@/components/artists/artist-artwork-showcase";
import { ArtistAssociatedVenuesSection } from "@/components/artists/artist-associated-venues-section";
import { getSessionUser } from "@/lib/auth";
import { dedupeAssociatedVenues } from "@/lib/artist-associated-venues";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { buildArtistJsonLd, getDetailUrl } from "@/lib/seo.public-profiles";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { ArtworkCountBadge } from "@/components/artwork/artwork-count-badge";
import { countPublishedArtworksByArtist, listFeaturedArtworksByArtist } from "@/lib/artworks";
import { deriveArtistTags, getArtistArtworks } from "@/lib/artists";

const FALLBACK_METADATA = { title: "Artist | Artio", description: "Browse artist profiles and related events on Artio." };

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!hasDatabaseUrl()) return FALLBACK_METADATA;
  const artist = await db.artist.findFirst({ where: { slug, isPublished: true, deletedAt: null }, select: { name: true, bio: true, avatarImageUrl: true, featuredImageUrl: true, images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } } } });
  if (!artist) return FALLBACK_METADATA;
  const metaDescription = (artist.bio ?? "").trim().slice(0, 160) || FALLBACK_METADATA.description;
  const ogDescription = (artist.bio ?? "").trim().slice(0, 300) || FALLBACK_METADATA.description;
  const artistImage = resolveEntityPrimaryImage(artist);
  const imageUrl = artistImage?.url ?? null;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    title: `${artist.name} | Artio`,
    description: metaDescription,
    alternates: {
      canonical: `${siteUrl}/artists/${slug}`,
    },
    openGraph: { title: `${artist.name} | Artio`, description: ogDescription, images: imageUrl ? [{ url: imageUrl, alt: artist.name }] : undefined },
    twitter: {
      card: "summary_large_image",
      title: `${artist.name} | Artio`,
      description: ogDescription,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
export default async function ArtistDetail({ params }: { params: Promise<{ slug: string }> }) {
  if (!hasDatabaseUrl()) return <main className="p-6">Set DATABASE_URL to view artists locally.</main>;
  const { slug } = await params;
  const now = new Date();
  const user = await getSessionUser();

  const artist = await db.artist.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      isAiDiscovered: true,
      userId: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      linkedinUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
      mediums: true,
      avatarImageUrl: true,
      featuredImageUrl: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
      eventArtists: {
        where: { event: { isPublished: true, deletedAt: null, startAt: { gte: now } } },
        orderBy: { event: { startAt: "asc" } },
        take: 24,
        select: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              startAt: true,
              endAt: true,
              venue: { select: { id: true, name: true, slug: true } },
              images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
              eventTags: { select: { tag: { select: { slug: true } } } },
            },
          },
        },
      },
      venueAssociations: {
        where: { status: "APPROVED" },
        select: {
          id: true,
          role: true,
          venue: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!artist) notFound();

  const pastEventArtistsPromise = db.eventArtist.findMany({
    where: { artistId: artist.id, event: { isPublished: true, deletedAt: null, endAt: { lt: now } } },
    orderBy: { event: { startAt: "desc" } },
    take: 24,
    select: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startAt: true,
          endAt: true,
          venue: { select: { name: true, slug: true } },
          images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
          eventTags: { select: { tag: { select: { slug: true } } } },
        },
      },
    },
  });

  const artworkCountsByEventPromise = pastEventArtistsPromise.then((pastEventArtists) => db.artworkEvent.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: [...artist.eventArtists.map((r) => r.event.id), ...pastEventArtists.map((r) => r.event.id)] },
      artwork: { isPublished: true, deletedAt: null },
    },
    _count: { _all: true },
  }));

  const [followersCount, existingFollow, artworkCount, featuredArtworks, showcaseResult, forSaleCount, pastEventArtists, artworkCountsByEvent] = await Promise.all([
    db.follow.count({ where: { targetType: "ARTIST", targetId: artist.id } }),
    user ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "ARTIST", targetId: artist.id } }, select: { id: true } }) : Promise.resolve(null),
    countPublishedArtworksByArtist(artist.id),
    listFeaturedArtworksByArtist(artist.id, 6),
    getArtistArtworks(slug, { limit: 24, sort: "newest", resolvedArtistId: artist.id }),
    db.artwork.count({ where: { artistId: artist.id, isPublished: true, deletedAt: null, priceAmount: { not: null } } }),
    pastEventArtistsPromise,
    artworkCountsByEventPromise,
  ]);

  const artworkCountMap = new Map(artworkCountsByEvent.map((row) => [row.eventId, row._count._all]));

  const initialArtworks = showcaseResult.artworks;
  const allArtworkTags = artist.mediums.length > 0
    ? artist.mediums
    : Array.from(new Set(initialArtworks.flatMap((item) => item.tags))).filter(Boolean);

  const artistImage = resolveEntityPrimaryImage(artist);
  const imageUrl = artistImage?.url ?? null;
  const events = artist.eventArtists.map((row) => {
    const image = resolveEntityPrimaryImage(row.event);
    return {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startAt: row.event.startAt,
      endAt: row.event.endAt,
      venueName: row.event.venue?.name,
      venueSlug: row.event.venue?.slug,
      imageUrl: image?.url ?? null,
      image,
      imageAlt: image?.alt ?? row.event.title,
      tags: row.event.eventTags.map(({ tag }) => tag.slug),
      artworkCount: artworkCountMap.get(row.event.id) ?? 0,
    };
  });

  const pastEvents = pastEventArtists.map((row) => {
    const image = resolveEntityPrimaryImage(row.event);
    return {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startAt: row.event.startAt,
      endAt: row.event.endAt,
      venueName: row.event.venue?.name,
      venueSlug: row.event.venue?.slug,
      imageUrl: image?.url ?? null,
      image,
      imageAlt: image?.alt ?? row.event.title,
      tags: row.event.eventTags.map(({ tag }) => tag.slug),
      artworkCount: artworkCountMap.get(row.event.id) ?? 0,
    };
  });

  const eventDerivedVenues = Array.from(
    new Map(
      artist.eventArtists
        .filter((row) => row.event.venue != null)
        .map((row) => [row.event.venue!.slug, row.event.venue!]),
    ).values(),
  );

  const approvedAssociations = artist.venueAssociations.map((a) => ({
    id: a.venue.id,
    name: a.venue.name,
    slug: a.venue.slug,
    role: a.role,
  }));
  const { verified, derived } = dedupeAssociatedVenues(approvedAssociations, eventDerivedVenues);

  const artistTags = deriveArtistTags(artist.mediums, events.map((event) => event.tags));
  const detailUrl = getDetailUrl("artist", slug);
  const jsonLd = buildArtistJsonLd({ name: artist.name, description: artist.bio, detailUrl, imageUrl, websiteUrl: artist.websiteUrl });
  const showClaimCta = artist.isAiDiscovered && !artist.userId && artist.status !== "IN_REVIEW";

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="entity_viewed" props={{ type: "artist", slug }} />
      <EntityPageViewTracker entityType="ARTIST" entityId={artist.id} />
      <EntityHeader
        title={artist.name}
        subtitle={artistTags.slice(0, 2).join(" • ") || "Artist profile"}
        image={artistImage}
        imageUrl={artist.avatarImageUrl ?? imageUrl}
        coverImage={artistImage}
        coverUrl={imageUrl}
        tags={artistTags}
        primaryAction={<FollowButton targetType="ARTIST" targetId={artist.id} initialIsFollowing={Boolean(existingFollow)} initialFollowersCount={followersCount} isAuthenticated={Boolean(user)} analyticsSlug={artist.slug} />}
        meta={<div className="flex items-center gap-2"><ArtworkCountBadge count={artworkCount} href={`/artwork?artistId=${artist.id}`} /><span className="text-xs text-muted-foreground">{forSaleCount} for sale</span></div>}
      />
      {showClaimCta ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Link className="underline" href={`/artists/${artist.slug}/claim`}>Is this your profile? Claim it.</Link>
        </div>
      ) : null}


      {Boolean(user) ? <ContextualNudgeSlot page="artist_detail" type="entity_save_search" nudgeId="nudge_entity_save_search" title="Turn this into alerts" body="Save a search like this to get weekly updates." destination={`/search?q=${encodeURIComponent(artist.name)}`} /> : null}

      <EntityTabs
        artworks={<ArtistArtworkShowcase artistSlug={slug} initialArtworks={initialArtworks} initialNextCursor={showcaseResult.nextCursor} totalCount={showcaseResult.total} availableTags={allArtworkTags} />}
        upcoming={(
          <section className="space-y-3">
            <SectionHeader title="Upcoming events" subtitle="Catch this artist's next exhibitions and shows." />
            {events.length === 0 ? <EmptyState title="No upcoming events" description="Follow this artist and we’ll keep you posted." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {events.map((event) => <EventCard key={event.id} href={`/events/${event.slug}`} title={event.title} startAt={event.startAt} endAt={event.endAt} venueName={event.venueName} venueSlug={event.venueSlug} image={event.image} imageUrl={event.imageUrl} imageAlt={event.imageAlt} tags={event.tags} artworkCount={event.artworkCount} viewArtworksHref={(event.artworkCount ?? 0) > 0 ? `/artwork?eventId=${event.id}` : undefined} />)}
              </div>
            )}
            {featuredArtworks.length > 0 ? <ArtworkRelatedSection title="Featured artworks" subtitle="Selected by the artist." items={featuredArtworks} viewAllHref={artworkCount > 6 ? `/artwork?artistId=${artist.id}` : undefined} /> : null}
            <ArtworkRelatedSection
              title={`Artworks by ${artist.name}`}
              subtitle="Published works from this artist."
              items={showcaseResult.artworks.map((a) => ({
                id: a.id,
                slug: a.key,
                title: a.title,
                coverUrl: a.images[0]?.url ?? null,
                artist: { id: artist.id, name: a.artist.name },
              }))}
              viewAllHref={artworkCount > 6 ? `/artwork?artistId=${artist.id}` : undefined}
            />
          </section>
        )}
        past={(
          <section className="space-y-3">
            <SectionHeader title="Past events" subtitle="Explore this artist's previous exhibitions and shows." />
            {pastEvents.length === 0 ? <EmptyState title="No past events" description="Past events featuring this artist will appear here." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pastEvents.map((event) => <EventCard key={event.id} href={`/events/${event.slug}`} title={event.title} startAt={event.startAt} endAt={event.endAt} venueName={event.venueName} venueSlug={event.venueSlug} image={event.image} imageUrl={event.imageUrl} imageAlt={event.imageAlt} tags={event.tags} artworkCount={event.artworkCount} viewArtworksHref={(event.artworkCount ?? 0) > 0 ? `/artwork?eventId=${event.id}` : undefined} />)}
              </div>
            )}
          </section>
        )}
        about={(
          <>
            <EntityAboutCard description={artist.bio} websiteUrl={artist.websiteUrl} instagramUrl={artist.instagramUrl} twitterUrl={artist.twitterUrl} linkedinUrl={artist.linkedinUrl} tiktokUrl={artist.tiktokUrl} youtubeUrl={artist.youtubeUrl} tags={artistTags} />
            {verified.length > 0 || derived.length > 0 ? (
              <ArtistAssociatedVenuesSection verified={verified} derived={derived} />
            ) : null}
          </>
        )}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </PageShell>
  );
}
