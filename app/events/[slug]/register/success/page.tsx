import Link from "next/link";
import { FollowButton } from "@/components/follows/follow-button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getSessionUser } from "@/lib/auth";
import { confirmCheckoutSession } from "@/lib/checkout-confirm";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { publishedEventWhere } from "@/lib/publish-status";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage(
  { params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ session_id?: string }> },
) {
  const { slug } = await params;
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <PageShell>
        <Card className="section-stack p-6">
          <h1 className="type-h3">We couldn&apos;t verify your payment</h1>
          <p className="type-caption">Missing checkout session id.</p>
          <Link href={`/events/${slug}`} className="text-sm underline">Back to event</Link>
        </Card>
      </PageShell>
    );
  }

  const stripe = await getStripeClient();
  const result = await confirmCheckoutSession(sessionId, slug, {
    retrieveCheckoutSession: (id) => stripe.checkout.sessions.retrieve(id),
    findPublishedEventBySlug: (eventSlug) => db.event.findFirst({
      where: { slug: eventSlug, deletedAt: null, ...publishedEventWhere() },
      select: { slug: true, title: true },
    }),
    findRegistrationById: (registrationId) => db.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, status: true, confirmationCode: true, guestEmail: true },
    }),
    updateRegistrationStatus: (registrationId, data) => db.registration.update({ where: { id: registrationId }, data }),
    enqueueNotification: (payload) => enqueueNotification(payload as never),
  });

  if (!result.ok) {
    return (
      <PageShell>
        <Card className="section-stack p-6">
          <h1 className="type-h3">We couldn&apos;t verify your payment</h1>
          <p className="type-caption">{result.message ?? "Please contact support if you were charged."}</p>
          <Link href={`/events/${result.eventSlug}`} className="text-sm underline">Back to event</Link>
        </Card>
      </PageShell>
    );
  }

  const [user, event] = await Promise.all([
    getSessionUser(),
    db.event.findFirst({
      where: { slug: result.eventSlug, deletedAt: null, ...publishedEventWhere() },
      select: {
        id: true,
        slug: true,
        venueId: true,
        venue: { select: { id: true, name: true, slug: true } },
        eventArtists: {
          take: 3,
          orderBy: { createdAt: "asc" },
          where: { artist: { isPublished: true } },
          select: { artist: { select: { id: true, name: true, slug: true, bio: true } } },
        },
      },
    }),
  ]);

  const venue = event?.venue ?? null;
  const artistIds = event?.eventArtists.map((entry) => entry.artist.id) ?? [];
  const now = new Date();

  const [venueFollowersCount, isFollowingVenue, moreVenueEvents, artistFollowerRows, followedArtists] = await Promise.all([
    venue ? db.follow.count({ where: { targetType: "VENUE", targetId: venue.id } }) : Promise.resolve(0),
    user && venue
      ? db.follow.findUnique({
        where: { userId_targetType_targetId: { userId: user.id, targetType: "VENUE", targetId: venue.id } },
        select: { id: true },
      }).then(Boolean)
      : Promise.resolve(false),
    venue
      ? db.event.findMany({
        where: {
          venueId: venue.id,
          id: { not: event?.id },
          deletedAt: null,
          startAt: { gte: now },
          ...publishedEventWhere(),
        },
        select: { id: true, slug: true, title: true },
        orderBy: { startAt: "asc" },
        take: 3,
      })
      : Promise.resolve([]),
    artistIds.length
      ? db.follow.groupBy({
        by: ["targetId"],
        where: { targetType: "ARTIST", targetId: { in: artistIds } },
        _count: { _all: true },
      })
      : Promise.resolve([]),
    user && artistIds.length
      ? db.follow.findMany({
        where: { userId: user.id, targetType: "ARTIST", targetId: { in: artistIds } },
        select: { targetId: true },
      })
      : Promise.resolve([]),
  ]);

  const artistFollowers = new Map(artistFollowerRows.map((row) => [row.targetId, row._count._all]));
  const followedArtistIds = new Set(followedArtists.map((follow) => follow.targetId));

  return (
    <PageShell>
      <Card className="section-stack p-6">
        <h1 className="type-h3">Registration confirmed</h1>
        <p className="type-caption">You&apos;re registered! You&apos;re booked for {result.eventTitle}.</p>
        <p className="text-2xl font-semibold" data-testid="confirmation-code">{result.confirmationCode}</p>
        <Link href={`/events/${result.eventSlug}`} className="text-sm underline">Back to event</Link>
      </Card>

      <div className="mt-6 space-y-4">
        {venue ? (
          <Card className="section-stack p-6">
            <h2 className="text-lg font-semibold">Follow {venue.name}</h2>
            <FollowButton
              targetType="VENUE"
              targetId={venue.id}
              initialIsFollowing={isFollowingVenue}
              initialFollowersCount={venueFollowersCount}
              isAuthenticated={Boolean(user)}
              analyticsSlug={venue.slug}
            />
          </Card>
        ) : null}

        {venue ? (
          <Card className="section-stack p-6">
            <h2 className="text-lg font-semibold">More events at {venue.name}</h2>
            {moreVenueEvents.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {moreVenueEvents.map((moreEvent) => (
                  <li key={moreEvent.id}>
                    <Link href={`/events/${moreEvent.slug}`} className="underline">{moreEvent.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No other upcoming events at this venue right now.</p>
            )}
          </Card>
        ) : null}

        {event && event.eventArtists.length > 0 ? (
          <Card className="section-stack p-6">
            <h2 className="text-lg font-semibold">Artists at this event</h2>
            <ul className="space-y-4">
              {event.eventArtists.map(({ artist }) => (
                <li key={artist.id} className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/artists/${artist.slug}`} className="font-medium underline">{artist.name}</Link>
                    {artist.bio ? <p className="text-sm text-muted-foreground">{artist.bio.slice(0, 100)}{artist.bio.length > 100 ? "…" : ""}</p> : null}
                  </div>
                  <FollowButton
                    targetType="ARTIST"
                    targetId={artist.id}
                    initialIsFollowing={followedArtistIds.has(artist.id)}
                    initialFollowersCount={artistFollowers.get(artist.id) ?? 0}
                    isAuthenticated={Boolean(user)}
                    analyticsSlug={artist.slug}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="section-stack p-6">
          <h2 className="text-lg font-semibold">Add to calendar</h2>
          <Link
            href={`/api/events/${result.eventSlug}/ical`}
            className="inline-flex w-fit rounded border border-border px-3 py-1 text-sm ui-trans ui-press hover:bg-muted hover:shadow-sm"
          >
            Download iCal
          </Link>
        </Card>
      </div>
    </PageShell>
  );
}
