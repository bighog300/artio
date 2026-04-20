import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { db } from "@/lib/db";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatEventDateRange } from "@/components/events/event-format";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/saved");

  const [favorites, artworks] = await Promise.all([
    db.favorite.findMany({
      where: { userId: user.id, targetType: { in: ["EVENT", "ARTWORK"] } },
      orderBy: { createdAt: "desc" },
      select: { targetType: true, targetId: true, createdAt: true },
    }),
    db.artwork.findMany({
      where: { isPublished: true },
      select: { id: true, slug: true, title: true },
    }),
  ]);

  const savedEventIds = favorites.filter((item) => item.targetType === "EVENT").map((item) => item.targetId);
  const savedArtworkIds = favorites.filter((item) => item.targetType === "ARTWORK").map((item) => item.targetId);

  const events = savedEventIds.length
    ? await db.event.findMany({
      where: { id: { in: savedEventIds }, isPublished: true, deletedAt: null },
      include: { venue: { select: { name: true } } },
    })
    : [];

  const sortedEvents = events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const artworkMap = new Map(artworks.map((item) => [item.id, item]));
  const savedArtworks = savedArtworkIds.map((id) => artworkMap.get(id)).filter(Boolean);

  const isEmpty = sortedEvents.length === 0 && savedArtworks.length === 0;

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="saved_screen_viewed" />
      <PageHeader title="Saved" subtitle="Your saved events and artworks in one place." />

      {isEmpty ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save events from discovery surfaces to build your return loop."
          actions={[{ label: "Browse events", href: "/events" }]}
        />
      ) : null}

      <section className="section-stack">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Saved events</h2>
          <Link className="text-sm underline" href="/events">Find more events</Link>
        </div>
        {sortedEvents.length === 0 ? <p className="text-sm text-muted-foreground">No saved events yet.</p> : null}
        <ul className="space-y-2">
          {sortedEvents.map((event) => (
            <li key={event.id} className="rounded border p-3">
              <Link className="font-medium underline" href={`/events/${event.slug}`}>{event.title}</Link>
              <p className="text-sm text-muted-foreground">{formatEventDateRange(event.startAt, event.endAt, event.timezone ?? undefined)} · {event.venue?.name ?? "Venue TBA"}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-stack">
        <h2 className="text-lg font-semibold">Saved galleries / artworks</h2>
        <p className="text-xs text-muted-foreground">Using existing saved artwork support for Sprint 1.</p>
        {savedArtworks.length === 0 ? <p className="text-sm text-muted-foreground">No saved artworks yet.</p> : null}
        <ul className="space-y-2">
          {savedArtworks.map((artwork) => (
            <li key={artwork!.id} className="rounded border p-3">
              <Link className="font-medium underline" href={`/artwork/${artwork!.slug}`}>{artwork!.title}</Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
