import { notFound } from "next/navigation";
import { computeReadiness } from "@/lib/publish-blockers";
import { db } from "@/lib/db";
import ModerationDetailClient from "./moderation-detail-client";

type Params = { type: "venue" | "event"; id: string };

export default async function ModerationDetailPage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params;
  if (type !== "venue" && type !== "event") notFound();

  if (type === "venue") {
    const venue = await db.venue.findUnique({
      where: { id },
      include: {
        targetSubmissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { submitter: { select: { id: true, email: true, name: true } } },
        },
      },
    });
    if (!venue) notFound();
    const readiness = computeReadiness(venue);
    const owner = venue.targetSubmissions[0]?.submitter;

    return (
      <main className="grid gap-6 lg:grid-cols-2">
        <section className="rounded border p-4 space-y-2">
          <h1 className="text-xl font-semibold">{venue.name}</h1>
          <p className="text-sm text-muted-foreground">/{venue.slug}</p>
          <p className="text-sm">{venue.city ?? "—"}, {venue.country ?? "—"}</p>
          <p className="text-sm">{venue.description ?? "No description"}</p>
        </section>

        <section className="space-y-4">
          <section className="rounded border p-4 space-y-2">
            <h2 className="font-semibold">Status Card</h2>
            <p className="text-sm">Current status: <strong>{venue.status}</strong></p>
            <p className="text-sm">Created: {venue.createdAt.toISOString()}</p>
            <p className="text-sm">Updated: {venue.updatedAt.toISOString()}</p>
            <p className="text-sm">Owner: {owner?.name ?? owner?.email ?? "Unknown"}</p>
          </section>

          <section className="rounded border p-4 space-y-2">
            <h2 className="font-semibold">Publish Readiness Card</h2>
            <p className="text-sm">{readiness.ready ? "Ready to publish" : "Blocked"}</p>
            <ul className="list-disc pl-5 text-sm">
              {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </section>

          <ModerationDetailClient type="venue" id={venue.id} status={venue.status as never} blockers={readiness.blockers} />
        </section>
      </main>
    );
  }

  const event = await db.event.findUnique({
    where: { id },
    include: {
      venue: { select: { status: true, isPublished: true, name: true } },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { submitter: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!event) notFound();
  const readiness = computeReadiness({ startAt: event.startAt, timezone: event.timezone, venue: event.venue });
  const owner = event.submissions[0]?.submitter;

  return (
    <main className="grid gap-6 lg:grid-cols-2">
      <section className="rounded border p-4 space-y-2">
        <h1 className="text-xl font-semibold">{event.title}</h1>
        <p className="text-sm text-muted-foreground">/{event.slug}</p>
        <p className="text-sm">Venue: {event.venue?.name ?? "—"}</p>
        <p className="text-sm">Starts: {event.startAt.toISOString()}</p>
        <p className="text-sm">{event.description ?? "No description"}</p>
      </section>

      <section className="space-y-4">
        <section className="rounded border p-4 space-y-2">
          <h2 className="font-semibold">Status Card</h2>
          <p className="text-sm">Current status: <strong>{event.status}</strong></p>
          <p className="text-sm">Created: {event.createdAt.toISOString()}</p>
          <p className="text-sm">Updated: {event.updatedAt.toISOString()}</p>
          <p className="text-sm">Owner: {owner?.name ?? owner?.email ?? "Unknown"}</p>
        </section>

        <section className="rounded border p-4 space-y-2">
          <h2 className="font-semibold">Publish Readiness Card</h2>
          <p className="text-sm">{readiness.ready ? "Ready to publish" : "Blocked"}</p>
          <ul className="list-disc pl-5 text-sm">
            {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </section>

        <ModerationDetailClient type="event" id={event.id} status={event.status as never} blockers={readiness.blockers} />
      </section>
    </main>
  );
}
