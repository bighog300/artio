import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { PageHeader } from "@/components/ui/page-header";
import EventSetupHeader from "@/app/my/_components/EventSetupHeader";
import EventCompletionProgress from "@/app/my/_components/EventCompletionProgress";
import EventSetupSection from "@/app/my/_components/EventSetupSection";
import EventPublishPanel from "@/app/my/_components/EventPublishPanel";
import { EventEditorForm } from "@/app/my/events/[eventId]/page-client";
import { getEventCompletionChecks } from "@/lib/events/event-completion";

export default async function MyEventEditPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/events");

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
      ticketUrl: true,
      isPublished: true,
      featuredAssetId: true,
      eventType: true,
      featuredAsset: { select: { url: true } },
      venue: { select: { id: true, name: true, city: true, postcode: true, lat: true, lng: true } },
      submissions: { where: { type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });

  if (!event) notFound();
  const submissionStatus = event.submissions[0]?.status ?? null;
  const checks = getEventCompletionChecks({ event, venueForEvent: event.venue });

  const managedVenueMemberships = await db.venueMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } },
    select: { venueId: true, venue: { select: { name: true } } },
  });
  const managedVenues = managedVenueMemberships.map((membership) => ({ id: membership.venueId, name: membership.venue.name }));

  return (
    <main className="space-y-6 p-6">
      <PageHeader title="Event Setup" subtitle="Complete your event details and submit for review." />

      <EventSetupHeader event={{ title: event.title, isPublished: event.isPublished }} submissionStatus={submissionStatus} />
      <EventCompletionProgress checks={checks} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <EventSetupSection title="Event details" description="Edit all event fields, then save once." complete={checks.basics && checks.schedule}>
            <EventEditorForm
              event={{
                id: event.id,
                title: event.title,
                venueId: event.venueId,
                startAt: event.startAt.toISOString(),
                endAt: event.endAt?.toISOString() ?? null,
                ticketUrl: event.ticketUrl,
                eventType: event.eventType,
                featuredAssetId: event.featuredAssetId,
                featuredAsset: event.featuredAsset,
              }}
              venues={managedVenues}
            />
          </EventSetupSection>

          <EventSetupSection title="Location" description="Used for nearby and map discovery." complete={checks.location || !checks.locationRequired}>
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
            <p className="font-medium">Ready to submit?</p>
            <p className="mt-1 text-muted-foreground">If your checklist is complete, submit your event for moderation.</p>
            <Link className="mt-2 inline-block underline" href="#publish-panel">Submit for review</Link>
          </div>
        </section>

        <aside className="order-1 lg:order-2 lg:col-span-1">
          <EventPublishPanel event={{ id: event.id, slug: event.slug, isPublished: event.isPublished }} checks={checks} submissionStatus={submissionStatus} />
        </aside>
      </div>
    </main>
  );
}
