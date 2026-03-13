import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeReadiness } from "@/lib/publish-readiness";
import { db } from "@/lib/db";
import ModerationDetailClient from "./moderation-detail-client";

type Params = { type: "venue" | "event" | "artist" | "artwork"; id: string };

function formatDuration(startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) return "—";
  const minutes = Math.floor((endAt.getTime() - startAt.getTime()) / 60000);
  if (minutes < 0) return "Invalid";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function formatLocalTime(value: Date | null, timezone: string | null) {
  if (!value || !timezone) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
      timeZoneName: "short",
    }).format(value);
  } catch {
    return "—";
  }
}

export default async function ModerationDetailPage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params;
  if (type !== "venue" && type !== "event" && type !== "artist" && type !== "artwork") notFound();

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

  if (type === "artwork") {
    const [artwork, targetSubmission] = await Promise.all([
      db.artwork.findUnique({
        where: { id },
        select: {
          id: true,
          slug: true,
          title: true,
          medium: true,
          year: true,
          description: true,
          isPublished: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          featuredAssetId: true,
          images: {
            take: 4,
            orderBy: { sortOrder: "asc" },
            select: { id: true, alt: true, asset: { select: { url: true } } },
          },
        },
      }),
      db.submission.findFirst({
        where: { type: "ARTWORK", note: `artworkId:${id}` },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true, name: true } } },
      }),
    ]);
    if (!artwork) notFound();
    const owner = targetSubmission?.submitter;

    return (
      <main className="grid gap-6 lg:grid-cols-2">
        <section className="rounded border p-4 space-y-2">
          <h1 className="text-xl font-semibold">{artwork.title}</h1>
          <p className="text-sm text-muted-foreground">/{artwork.slug ?? "—"}</p>
          <p className="text-sm">Medium: {artwork.medium ?? "—"}</p>
          <p className="text-sm">Year: {artwork.year ?? "—"}</p>
          <p className="text-sm">{artwork.description ?? "No description"}</p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {artwork.images.map((image) => (
              <div key={image.id} className="relative aspect-square overflow-hidden rounded border">
                <Image src={image.asset.url} alt={image.alt ?? artwork.title} fill className="object-cover" sizes="(min-width: 1024px) 25vw, 45vw" />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <section className="rounded border p-4 space-y-2">
            <h2 className="font-semibold">Status Card</h2>
            <p className="text-sm">Current status: <strong>{artwork.isPublished ? "PUBLISHED" : "DRAFT"}</strong></p>
            <p className="text-sm">Created: {artwork.createdAt.toISOString()}</p>
            <p className="text-sm">Updated: {artwork.updatedAt.toISOString()}</p>
            <p className="text-sm">Owner: {owner?.name ?? owner?.email ?? "Unknown"}</p>
          </section>

          <ModerationDetailClient type="artwork" id={artwork.id} status={artwork.isPublished ? "PUBLISHED" : "DRAFT"} blockers={[]} />
        </section>
      </main>
    );
  }

  if (type === "artist") {
    const artist = await db.artist.findUnique({
      where: { id },
      include: {
        targetSubmissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { submitter: { select: { id: true, email: true, name: true } } },
        },
      },
    });
    if (!artist) notFound();
    const owner = artist.targetSubmissions[0]?.submitter;

    return (
      <main className="grid gap-6 lg:grid-cols-2">
        <section className="rounded border p-4 space-y-2">
          <h1 className="text-xl font-semibold">{artist.name}</h1>
          <p className="text-sm text-muted-foreground">/{artist.slug}</p>
          <p className="text-sm">{artist.bio ?? "No bio"}</p>
          {artist.websiteUrl ? (
            <a href={artist.websiteUrl} className="text-sm underline" target="_blank" rel="noopener noreferrer">
              {artist.websiteUrl}
            </a>
          ) : null}
        </section>

        <section className="space-y-4">
          <section className="rounded border p-4 space-y-2">
            <h2 className="font-semibold">Status Card</h2>
            <p className="text-sm">Current status: <strong>{artist.isPublished ? "Published" : "Unpublished"}</strong></p>
            <p className="text-sm">Created: {artist.createdAt.toISOString()}</p>
            <p className="text-sm">Updated: {artist.updatedAt.toISOString()}</p>
            <p className="text-sm">Owner: {owner?.name ?? owner?.email ?? "Unknown"}</p>
          </section>

          <ModerationDetailClient
            type="artist"
            id={artist.id}
            status={"IN_REVIEW"}
            blockers={[]}
          />
        </section>
      </main>
    );
  }

  const event = await db.event.findUnique({
    where: { id },
    include: {
      venue: { select: { id: true, status: true, isPublished: true, name: true } },
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

        <section className="rounded border p-4 space-y-2">
          <h2 className="font-semibold">Schedule Integrity Card</h2>
          <p className="text-sm">StartAt: {event.startAt ? event.startAt.toISOString() : "—"}{event.timezone ? ` (${event.timezone})` : ""}</p>
          <p className="text-sm">EndAt: {event.endAt ? event.endAt.toISOString() : "—"}</p>
          <p className="text-sm">Duration: {formatDuration(event.startAt, event.endAt)}</p>
          <p className="text-sm">Derived local time: {formatLocalTime(event.startAt, event.timezone)}</p>
          {!event.timezone ? <p className="text-sm text-amber-700">Warning: timezone missing.</p> : null}
          {!event.startAt ? <p className="text-sm text-amber-700">Warning: startAt missing.</p> : null}
          {event.startAt && event.endAt && event.endAt < event.startAt ? <p className="text-sm text-amber-700">Warning: endAt is before startAt.</p> : null}
        </section>

        <section className="rounded border p-4 space-y-2">
          <h2 className="font-semibold">Venue Dependency Card</h2>
          {event.venue?.status !== "PUBLISHED" ? (
            <>
              <p className="text-sm text-amber-700">This event cannot be published until its venue is published.</p>
              {event.venue?.id ? <Link className="underline text-sm" href={`/admin/moderation/venue/${event.venue.id}`}>Open venue moderation page</Link> : null}
            </>
          ) : <p className="text-sm">Venue is published.</p>}
        </section>

        <ModerationDetailClient type="event" id={event.id} status={event.status as never} blockers={readiness.blockers} />
      </section>
    </main>
  );
}
