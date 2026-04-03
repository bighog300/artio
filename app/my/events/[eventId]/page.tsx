import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canSelfPublish, getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import EventSetupHeader from "@/app/my/_components/EventSetupHeader";
import EventSetupSection from "@/app/my/_components/EventSetupSection";
import { PublishPanel } from "@/components/my/PublishPanel";
import EventAnalyticsSummary from "@/components/my/events/EventAnalyticsSummary";
import { EventEditorForm } from "@/app/my/events/[eventId]/page-client";
import { getEventReadiness } from "@/lib/events/getEventReadiness";
import { ReadinessChecklist } from "@/components/publishing/ReadinessChecklist";

export default async function MyEventEditPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSessionUser();
  if (!user) return redirectToLogin("/my/events");

  const { eventId } = await params;

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      OR: [
        { submissions: { some: { submitterUserId: user.id, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] } } },
        { venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      endAt: true,
      venueId: true,
      seriesId: true,
      ticketUrl: true,
      ticketingMode: true,
      capacity: true,
      rsvpClosesAt: true,
      description: true,
      isPublished: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNotes: true,
      featuredAssetId: true,
      eventType: true,
      featuredAsset: { select: { url: true } },
      venue: { select: { id: true, name: true, city: true, postcode: true, lat: true, lng: true, timezone: true } },
    },
  });

  if (!event) notFound();
  const readiness = getEventReadiness(event);
  const canPublishDirectly = canSelfPublish(user);

  const managedVenueMemberships = await db.venueMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } },
    select: { venueId: true, venue: { select: { name: true } } },
  });
  const managedVenues = managedVenueMemberships.map((membership) => ({ id: membership.venueId, name: membership.venue.name }));
  const hasVenueMembership = event.venueId
    ? managedVenues.some((v) => v.id === event.venueId)
    : false;
  const editableVenues = hasVenueMembership || !event.venueId
    ? managedVenues
    : [];

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-4">
        <Link
          href="/my/events"
          className="inline-flex items-center rounded border px-3 py-1 text-sm hover:bg-muted"
        >
          ← My events
        </Link>
        <EventSetupHeader
          event={{ title: event.title, isPublished: event.isPublished, deletedAt: null }}
          submissionStatus={event.status}
          reviewNotes={event.reviewNotes}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <EventSetupSection title="Event details" description="Edit all event fields, then save once." complete={readiness.items.every((item) => item.complete)}>
            <EventEditorForm
              event={{
                id: event.id,
                title: event.title,
                venueId: event.venueId,
                seriesId: event.seriesId,
                startAt: event.startAt.toISOString(),
                endAt: event.endAt?.toISOString() ?? null,
                ticketUrl: event.ticketUrl,
                ticketingMode: event.ticketingMode,
                capacity: event.capacity,
                rsvpClosesAt: event.rsvpClosesAt?.toISOString() ?? null,
                description: event.description,
                eventType: event.eventType,
                featuredAssetId: event.featuredAssetId,
                featuredAsset: event.featuredAsset,
                venueTimezone: event.venue?.timezone ?? "UTC",
              }}
              venues={editableVenues}
            />
          </EventSetupSection>

          <EventSetupSection title="Location" description="Used for nearby and map discovery." complete={Boolean(event.venueId)}>
            <div className="space-y-2 text-sm">
              <p>{event.venue ? `${event.venue.name} · ${event.venue.city ?? ""} ${event.venue.postcode ?? ""}` : "Choose a venue to derive location."}</p>
              {event.venue && (event.venue.lat == null || event.venue.lng == null) ? (
                <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  Venue location missing — nearby/maps may not work. <Link className="underline" href={`/my/venues/${event.venue.id}`}>Fix venue location</Link>
                </p>
              ) : null}
              {event.venue?.lat != null && event.venue.lng != null ? <p className="text-muted-foreground">Coordinates: {event.venue.lat}, {event.venue.lng}</p> : null}
            </div>
          </EventSetupSection>

          <div className="rounded-md border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Ready to publish?</p>
            <p className="mt-1 text-muted-foreground">{canPublishDirectly ? "If your checklist is complete, use admin moderation controls to publish directly." : "If your checklist is complete, publish your event."}</p>
            <Link className="mt-2 inline-block underline" href="#publish-panel">{canPublishDirectly ? "Open moderation controls" : "Publish"}</Link>
          </div>

          <div className="rounded-md border p-4 text-sm">
            <p className="font-medium">Attendee management</p>
            <p className="mt-1 text-muted-foreground">View confirmed attendees and process cancellations or refunds.</p>
            <Link className="mt-2 inline-block underline" href={`/my/events/${event.id}/attendees`}>Open attendee list</Link>
            {event.venueId && event.isPublished ? (
              <Link
                className="mt-1 inline-block underline"
                href={`/my/venues/${event.venueId}/checkin/${event.id}`}
              >
                Check in attendees
              </Link>
            ) : null}
          </div>

          {event.isPublished ? <EventAnalyticsSummary eventId={event.id} /> : null}
        </section>

        <aside className="order-1 lg:order-2 lg:col-span-1">
          <div className="space-y-4">
            <ReadinessChecklist items={readiness.items} />
            <PublishPanel
              resourceType="event"
              id={event.id}
              status={event.status}
              title={event.title ?? "Untitled event"}
              publicUrl={event.slug ? `/events/${event.slug}` : undefined}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
