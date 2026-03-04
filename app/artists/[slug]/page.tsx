import type { Metadata } from "next";
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
import { ArtistBio } from "@/components/artists/artist-bio";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { buildArtistJsonLd, getDetailUrl } from "@/lib/seo.public-profiles";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { ArtworkCountBadge } from "@/components/artwork/artwork-count-badge";
import { countPublishedArtworksByArtist, listFeaturedArtworksByArtist, listPublishedArtworksByArtist } from "@/lib/artworks";
import { getArtistArtworks } from "@/lib/artists";

const FALLBACK_METADATA = { title: "Artist | Artpulse", description: "Browse artist profiles and related events on Artpulse." };

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!hasDatabaseUrl()) return FALLBACK_METADATA;
  const artist = await db.artist.findFirst({ where: { slug, isPublished: true, deletedAt: null }, select: { name: true, bio: true, avatarImageUrl: true, featuredImageUrl: true, images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } } } });
  if (!artist) return FALLBACK_METADATA;
  const description = (artist.bio ?? "").trim().slice(0, 160) || FALLBACK_METADATA.description;
  const imageUrl = resolveEntityPrimaryImage(artist)?.url ?? null;
  return { title: `${artist.name} | Artpulse`, description, openGraph: { title: `${artist.name} | Artpulse`, description, images: imageUrl ? [{ url: imageUrl, alt: artist.name }] : undefined } };
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
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
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
              venue: { select: { name: true, slug: true } },
              images: { take: 4, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
              eventTags: { select: { tag: { select: { slug: true } } } },
            },
          },
        },
      },
    },
  });

  if (!artist) notFound();

  const [followersCount, existingFollow, artworks, artworkCount, featuredArtworks, showcaseResult, forSaleCount, pastEventArtists] = await Promise.all([
    db.follow.count({ where: { targetType: "ARTIST", targetId: artist.id } }),
    user ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "ARTIST", targetId: artist.id } }, select: { id: true } }) : Promise.resolve(null),
    listPublishedArtworksByArtist(artist.id, 6),
    countPublishedArtworksByArtist(artist.id),
    listFeaturedArtworksByArtist(artist.id, 6),
    getArtistArtworks(slug, { limit: 24, sort: "newest" }),
    db.artwork.count({ where: { artistId: artist.id, isPublished: true, deletedAt: null, priceAmount: { not: null } } }),
    db.eventArtist.findMany({
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
    }),
  ]);

  const initialArtworks = showcaseResult.artworks;
  const allArtworkTags = Array.from(new Set(initialArtworks.flatMap((item) => item.tags))).filter(Boolean);

  const imageUrl = resolveEntityPrimaryImage(artist)?.url ?? null;
  const events = artist.eventArtists.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    slug: row.event.slug,
    startAt: row.event.startAt,
    endAt: row.event.endAt,
    venueName: row.event.venue?.name,
    venueSlug: row.event.venue?.slug,
    imageUrl: resolveEntityPrimaryImage(row.event)?.url ?? null,
    imageAlt: resolveEntityPrimaryImage(row.event)?.alt ?? row.event.title,
    tags: row.event.eventTags.map(({ tag }) => tag.slug),
  }));

  const pastEvents = pastEventArtists.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    slug: row.event.slug,
    startAt: row.event.startAt,
    endAt: row.event.endAt,
    venueName: row.event.venue?.name,
    venueSlug: row.event.venue?.slug,
    imageUrl: resolveEntityPrimaryImage(row.event)?.url ?? null,
    imageAlt: resolveEntityPrimaryImage(row.event)?.alt ?? row.event.title,
    tags: row.event.eventTags.map(({ tag }) => tag.slug),
  }));

  const artistTags = Array.from(new Set(events.flatMap((event) => event.tags))).slice(0, 8);
  const detailUrl = getDetailUrl("artist", slug);
  const jsonLd = buildArtistJsonLd({ name: artist.name, description: artist.bio, detailUrl, imageUrl, websiteUrl: artist.websiteUrl });

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="entity_viewed" props={{ type: "artist", slug }} />
      <EntityPageViewTracker entityType="ARTIST" entityId={artist.id} />
      <EntityHeader
        title={artist.name}
        subtitle={artistTags.slice(0, 2).join(" • ") || "Artist profile"}
        imageUrl={resolveEntityPrimaryImage(artist)?.url ?? artist.avatarImageUrl ?? imageUrl}
        coverUrl={imageUrl}
        tags={artistTags}
        primaryAction={<FollowButton targetType="ARTIST" targetId={artist.id} initialIsFollowing={Boolean(existingFollow)} initialFollowersCount={followersCount} isAuthenticated={Boolean(user)} analyticsSlug={artist.slug} />}
        meta={<div className="flex items-center gap-2"><ArtworkCountBadge count={artworkCount} href={`/artwork?artistId=${artist.id}`} /><span className="text-xs text-muted-foreground">{forSaleCount} for sale</span></div>}
      />

      {artist.bio ? <ArtistBio bio={artist.bio} /> : null}

      {Boolean(user) ? <ContextualNudgeSlot page="artist_detail" type="entity_save_search" nudgeId="nudge_entity_save_search" title="Turn this into alerts" body="Save a search like this to get weekly updates." destination={`/search?q=${encodeURIComponent(artist.name)}`} /> : null}

      <EntityTabs
        artworks={<ArtistArtworkShowcase artistSlug={slug} initialArtworks={initialArtworks} initialNextCursor={showcaseResult.nextCursor} totalCount={showcaseResult.total} availableTags={allArtworkTags} />}
        upcoming={(
          <section className="space-y-3">
            <SectionHeader title="Upcoming events" subtitle="Catch this artist's next exhibitions and shows." />
            {featuredArtworks.length > 0 ? <ArtworkRelatedSection title="Featured artworks" subtitle="Selected by the artist." items={featuredArtworks} viewAllHref={artworkCount > 6 ? `/artwork?artistId=${artist.id}` : undefined} /> : null}
            <ArtworkRelatedSection title={`Artworks by ${artist.name}`} subtitle="Published works from this artist." items={artworks} viewAllHref={artworkCount > 6 ? `/artwork?artistId=${artist.id}` : undefined} />
            {events.length === 0 ? <EmptyState title="No upcoming events" description="Follow this artist and we’ll keep you posted." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {events.map((event) => <EventCard key={event.id} href={`/events/${event.slug}`} title={event.title} startAt={event.startAt} endAt={event.endAt} venueName={event.venueName} venueSlug={event.venueSlug} imageUrl={event.imageUrl} imageAlt={event.imageAlt} tags={event.tags} />)}
              </div>
            )}
          </section>
        )}
        past={(
          <section className="space-y-3">
            <SectionHeader title="Past events" subtitle="Explore this artist's previous exhibitions and shows." />
            {pastEvents.length === 0 ? <EmptyState title="No past events" description="Past events featuring this artist will appear here." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pastEvents.map((event) => <EventCard key={event.id} href={`/events/${event.slug}`} title={event.title} startAt={event.startAt} endAt={event.endAt} venueName={event.venueName} venueSlug={event.venueSlug} imageUrl={event.imageUrl} imageAlt={event.imageAlt} tags={event.tags} />)}
              </div>
            )}
          </section>
        )}
        about={<EntityAboutCard description={artist.bio} websiteUrl={artist.websiteUrl} instagramUrl={artist.instagramUrl} tags={artistTags} />}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </PageShell>
  );
}
