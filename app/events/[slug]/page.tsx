import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { EventDetailActions } from "@/components/events/event-detail-actions";
import { EventGalleryLightbox } from "@/components/events/event-gallery-lightbox";
import { ArtworkRelatedSection } from "@/components/artwork/artwork-related-section";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventRailCard } from "@/components/events/event-rail-card";
import { formatEventDateRange } from "@/components/events/event-format";
import { buildDetailMetadata, getDetailUrl } from "@/lib/seo.public-profiles";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { ContextualNudgeSlot } from "@/components/onboarding/contextual-nudge-slot";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { ArtworkCountBadge } from "@/components/artwork/artwork-count-badge";
import { countPublishedArtworksByEvent, listPublishedArtworksByEvent } from "@/lib/artworks";
import { EntityPageViewTracker } from "@/components/analytics/entity-page-view-tracker";
import { listPublishedEventsInSeriesWithDeps } from "@/lib/series-events";
import { RsvpWidget } from "@/components/events/rsvp-widget";
import { PaidTicketWidget } from "@/components/events/paid-ticket-widget";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  if (!hasDatabaseUrl()) return buildDetailMetadata({ kind: "event", slug });

  try {
    const event = await db.event.findFirst({ where: { slug, isPublished: true, deletedAt: null, OR: [{ venueId: null }, { venue: { deletedAt: null } }] }, include: { images: { include: { asset: { select: { url: true } } }, orderBy: { sortOrder: "asc" } } } });
    if (!event) return buildDetailMetadata({ kind: "event", slug });
    const imageUrl = resolveEntityPrimaryImage(event)?.url ?? null;
    return buildDetailMetadata({ kind: "event", slug, title: event.title, description: event.description, imageUrl });
  } catch {
    return buildDetailMetadata({ kind: "event", slug });
  }
}

export default async function EventDetail({ params }: { params: Promise<{ slug: string }> }) {
  if (!hasDatabaseUrl()) return <PageShell><p className="type-caption">Set DATABASE_URL to view events locally.</p></PageShell>;

  const { slug } = await params;
  const event = await db.event.findFirst({
      where: { slug, isPublished: true, deletedAt: null },
      include: {
        venue: {
          select: {
            id: true,
            slug: true,
            name: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
        series: { select: { id: true, title: true } },
        eventTags: { include: { tag: true } },
        eventArtists: { include: { artist: { select: { id: true, slug: true, name: true } } } },
        images: { include: { asset: { select: { url: true } } }, orderBy: { sortOrder: "asc" } },
        ticketTiers: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, description: true, priceAmount: true, currency: true, capacity: true, registrations: { where: { status: { in: ["PENDING", "CONFIRMED", "WAITLISTED"] } }, select: { quantity: true } } },
        },
      },
    });
  if (!event) notFound();

  const [artworks, artworkCount, similarEvents, seriesEvents] = await Promise.all([
    listPublishedArtworksByEvent(event.id, 6),
    countPublishedArtworksByEvent(event.id),
    db.event.findMany({
    where: { isPublished: true, deletedAt: null, id: { not: event.id }, OR: [{ venueId: event.venueId ?? undefined }, { eventArtists: { some: { artistId: { in: event.eventArtists.map((ea) => ea.artistId) } } } }] },
    include: { venue: { select: { name: true } }, images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true } } } } },
    orderBy: { startAt: "asc" },
    take: 4,
  }),
    event.seriesId
      ? listPublishedEventsInSeriesWithDeps({ findMany: (args) => db.event.findMany(args) }, { seriesId: event.seriesId, excludeEventId: event.id })
      : Promise.resolve([]),
]);

  const isAuthenticated = false;
  const initialSaved = false;
  const showFreeEntryLabel = event.isFree && event.ticketingMode !== "RSVP" && event.ticketingMode !== "PAID" && !event.ticketUrl;
  const primaryImage = resolveEntityPrimaryImage(event);
  const detailUrl = getDetailUrl("event", slug);
  const offers = event.ticketTiers.map((tier) => {
    const registered = tier.registrations.reduce((sum, registration) => sum + registration.quantity, 0);
    const availability = tier.capacity == null || registered < tier.capacity ? "https://schema.org/InStock" : "https://schema.org/SoldOut";
    const offerUrl = event.ticketingMode === "EXTERNAL" && event.ticketUrl ? event.ticketUrl : detailUrl;
    return {
      "@type": "Offer",
      price: tier.priceAmount / 100,
      priceCurrency: tier.currency,
      availability,
      url: offerUrl,
    };
  });

  if (offers.length === 0 && event.isFree) {
    offers.push({
      "@type": "Offer",
      price: 0,
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      url: event.ticketingMode === "EXTERNAL" && event.ticketUrl ? event.ticketUrl : detailUrl,
    });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startAt.toISOString(),
    ...(event.endAt ? { endDate: event.endAt.toISOString() } : {}),
    ...(event.description ? { description: event.description } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue?.name ?? "Venue TBA",
      ...(event.venue?.addressLine1 ? { address: event.venue.addressLine1 } : {}),
    },
    organizer: {
      "@type": "Organization",
      name: event.venue?.name ?? "Artio",
    },
    ...(offers.length > 0 ? { offers } : {}),
    ...(primaryImage?.url ? { image: [primaryImage.url] } : {}),
  };

  const endForCalendar = event.endAt ?? new Date(new Date(event.startAt).getTime() + 60 * 60 * 1000);
  const calendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${new Date(event.startAt).toISOString().replace(/[-:]|\.\d{3}/g, "")}/${new Date(endForCalendar).toISOString().replace(/[-:]|\.\d{3}/g, "")}`;
  const directionsUrl = event.venue
    ? `https://maps.google.com/?q=${encodeURIComponent(
        [event.venue.addressLine1, event.venue.city, event.venue.country].filter(Boolean).join(", "),
      )}`
    : null;
  const outlookCalendarLink = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.title)}&startdt=${new Date(event.startAt).toISOString()}&enddt=${endForCalendar.toISOString()}${event.venue?.name ? `&location=${encodeURIComponent(event.venue.name)}` : ""}&path=%2Fcalendar%2Faction%2Fcompose&rru=addevent`;
  const icalLink = `/api/events/${event.slug}/ical`;

  return (
    <PageShell className="page-stack">
      <EntityPageViewTracker entityType="EVENT" entityId={event.id} />
      <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.title, href: `/events/${slug}` }]} />

      <section className="relative overflow-hidden rounded-2xl border border-border">
        <div className="relative h-64 md:h-80">
          {primaryImage ? <Image src={primaryImage.url} alt={primaryImage.alt ?? event.title} fill sizes="100vw" className="object-cover" /> : <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">No event image</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full section-stack p-5 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-h2 text-white">{event.title}</h1>
              {showFreeEntryLabel ? <Badge className="border-white/30 bg-white/20 text-white text-xs">Free</Badge> : null}
              <ArtworkCountBadge count={artworkCount} href={`/artwork?eventId=${event.id}`} badgeClassName="border-white/40 bg-white/10 text-white" />
            </div>
            <p className="type-caption text-white/90">{formatEventDateRange(event.startAt, event.endAt, event.timezone ?? undefined)} · {event.venue?.name ?? "Venue TBA"}</p>
            <EventDetailActions eventId={event.id} eventSlug={event.slug} nextUrl={`/events/${slug}`} isAuthenticated={isAuthenticated} initialSaved={initialSaved} calendarLink={calendarLink} outlookCalendarLink={outlookCalendarLink} icalLink={icalLink} subscribeFeedLink={event.venue?.slug ? `/api/venues/${event.venue.slug}/calendar` : null} ticketingMode={event.ticketingMode} />
            {isAuthenticated && (event.venue?.slug || event.eventArtists[0]?.artist.slug) ? (
              <ContextualNudgeSlot
                page="event_detail"
                type="event_detail_follow"
                nudgeId="nudge_event_detail_follow"
                title="Stay in the loop"
                body="Follow this venue or artist to personalize your following feed."
                destination={event.venue?.slug ? `/venues/${event.venue.slug}` : `/artists/${event.eventArtists[0]?.artist.slug}`}
              />
            ) : null}
          </div>
        </div>
      </section>

      {event.images.filter((image) => image.asset).length >= 2 ? (
        <EventGalleryLightbox
          images={event.images.flatMap((image) => (image.asset ? [{ id: image.id, src: image.asset.url, alt: image.alt ?? event.title }] : []))}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-[2fr_1fr] md:gap-6">
        <div className="section-stack">
          <article className="section-stack">
            <SectionHeader title="About this event" />
            <p className="type-caption whitespace-pre-wrap">{event.description || "Details coming soon."}</p>
          </article>
          <ArtworkRelatedSection title="Artworks at this event" subtitle="Published works linked to this event." items={artworks} viewAllHref={artworkCount > 6 ? `/artwork?eventId=${event.id}` : undefined} showArtistName />
          {event.eventArtists.length ? <article className="section-stack"><SectionHeader title="Lineup" /><div className="flex flex-wrap gap-2">{event.eventArtists.map((entry) => <Link key={entry.artistId} href={`/artists/${entry.artist.slug}`}><Badge variant="secondary" className="cursor-pointer hover:bg-secondary/60 transition-colors">{entry.artist.name}</Badge></Link>)}</div></article> : null}
          {event.eventTags.length ? <article className="section-stack"><SectionHeader title="Tags" /><div className="flex flex-wrap gap-2">{event.eventTags.map((eventTag) => <Badge key={eventTag.tag.id} variant="outline">{eventTag.tag.name}</Badge>)}</div></article> : null}
        </div>

        <Card className="section-stack h-fit p-6">
          <h3 className="type-h3">At a glance</h3>
          <p className="type-caption">{formatEventDateRange(event.startAt, event.endAt, event.timezone ?? undefined)}</p>
          {event.timezone ? <p className="text-xs text-muted-foreground">Times shown in {event.timezone}</p> : null}
          <p className="type-caption">{event.venue?.name ?? "Venue TBA"}</p>
          {event.venue?.addressLine1 ? (
            directionsUrl ? (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline hover:text-foreground">
                {event.venue.addressLine1}
              </a>
            ) : (
              <p className="type-caption">{event.venue.addressLine1}</p>
            )
          ) : (
            <p className="type-caption">Address unavailable</p>
          )}
          {event.ticketingMode === "RSVP" ? (
            <RsvpWidget eventSlug={event.slug} initialAvailability={{ available: null, isSoldOut: false, isRsvpClosed: false, tiers: [] }} />
          ) : event.ticketingMode === "PAID" ? (
            <PaidTicketWidget eventSlug={event.slug} tiers={event.ticketTiers.map((tier) => ({ ...tier, registered: tier.registrations.reduce((sum, registration) => sum + registration.quantity, 0) }))} />
          ) : event.ticketUrl ? (
            <Link href={event.ticketUrl} className="text-sm underline" target="_blank" rel="noreferrer">Get tickets</Link>
          ) : showFreeEntryLabel ? (
            <p className="text-sm font-medium text-emerald-700">Free entry</p>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href={icalLink}>Add to calendar</Link>
          </Button>
          {event.venue?.slug ? <Link href={`/venues/${event.venue.slug}`} className="text-sm underline">View details</Link> : null}
        </Card>
      </section>

      {event.series && (seriesEvents.length > 0) ? (
        <section className="section-stack">
          <SectionHeader title={`Part of ${event.series.title}`} subtitle={`${seriesEvents.length + 1} events in this series`} />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {seriesEvents.map((related) => (
              <EventRailCard
                key={related.id}
                href={`/events/${related.slug}`}
                title={related.title}
                startAt={related.startAt}
                venueName={related.venue?.name}
                imageUrl={resolveEntityPrimaryImage(related)?.url ?? null}
                imageAlt={resolveEntityPrimaryImage(related)?.alt}
              />
            ))}
          </div>
        </section>
      ) : null}

      {similarEvents.length ? (
        <section className="section-stack">
          <SectionHeader title="You might also like" />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {similarEvents.map((similar) => (
              <EventRailCard
                key={similar.id}
                href={`/events/${similar.slug}`}
                title={similar.title}
                startAt={similar.startAt}
                venueName={similar.venue?.name}
                imageUrl={resolveEntityPrimaryImage(similar)?.url ?? null}
                imageAlt={resolveEntityPrimaryImage(similar)?.alt}
              />
            ))}
          </div>
        </section>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script>/gi, '<\\/script>') }} />
    </PageShell>
  );
}
