import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { MyDashboardResponseSchema } from "@/lib/my/dashboard-schema";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import CompletenessBar from "./_components/CompletenessBar";
import StatusTileGroups from "./_components/StatusTileGroups";
import NeedsAttentionPanel from "./_components/NeedsAttentionPanel";

async function getDashboard(venueId?: string) {
  const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
  const baseUrl = await getServerBaseUrl();
  const res = await fetch(`${baseUrl}/api/my/dashboard${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  return MyDashboardResponseSchema.parse(await res.json());
}

export default async function MyDashboardPage({ searchParams }: { searchParams: Promise<{ venueId?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");

  const { venueId } = await searchParams;
  const data = await getDashboard(venueId);
  if (!data) return <main><p>Unable to load dashboard.</p></main>;

  return (
    <main className="space-y-4">
      <NeedsAttentionPanel attention={data.attention} />

      <StatusTileGroups counts={data.counts} venueId={venueId} />

      <section className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Venues</h2>
          <Link className="text-sm underline" href={venueId ? `/my/venues?venueId=${venueId}` : "/my/venues"}>View all</Link>
        </div>
        <div className="space-y-2 text-sm">
          {data.quickLists.venues.length === 0 ? <p className="rounded border p-2 text-muted-foreground">You haven&apos;t created any venues yet. <Link className="underline" href="/my/venues/new">Create Venue</Link></p> : data.quickLists.venues.map((venue) => (
            <article className="rounded border p-2" key={venue.id}>
              <p className="font-medium">{venue.name}</p>
              <p className="text-muted-foreground">{venue.status} · {new Date(venue.updatedAtISO).toLocaleDateString()}</p>
              {venue.completeness ? <CompletenessBar percent={venue.completeness.percent} missing={venue.completeness.missing} /> : null}
              <div className="mt-1 space-x-2">
                <Link className="underline" href={`/my/venues/${venue.id}`}>Edit</Link>
                <Link className="underline" href={`/my/venues/${venue.id}/submit-event`}>Submit Event</Link>
                {venue.status === "Published" ? <Link className="underline" href={`/venues/${venue.id}`}>View Public</Link> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upcoming events</h2>
          <Link className="text-sm underline" href={venueId ? `/my/events?venueId=${venueId}` : "/my/events"}>View all</Link>
        </div>
        <div className="space-y-2 text-sm">
          {data.quickLists.upcomingEvents.length === 0 ? <p className="rounded border p-2 text-muted-foreground">You don&apos;t have any upcoming events yet. <Link className="underline" href="/my/events/new">Create Event</Link></p> : data.quickLists.upcomingEvents.map((event) => (
            <article className="rounded border p-2" key={event.id}>
              <p className="font-medium">{event.title}</p>
              <p className="text-muted-foreground">{new Date(event.startAtISO).toLocaleDateString()} · {event.venueName ?? "No venue"}</p>
              <div className="mt-1 space-x-2">
                <Link className="underline" href={`/my/events/${event.id}`}>Edit</Link>
                {event.status === "Published" ? <Link className="underline" href={`/events/${event.id}`}>View Public</Link> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent artwork</h2>
          <Link className="text-sm underline" href={venueId ? `/my/artwork?venueId=${venueId}` : "/my/artwork"}>View all</Link>
        </div>
        <div className="space-y-2 text-sm">
          {data.quickLists.recentArtwork.length === 0 ? <p className="rounded border p-2 text-muted-foreground">You haven&apos;t added artwork yet. <Link className="underline" href="/my/artwork/new">Add Artwork</Link></p> : data.quickLists.recentArtwork.map((artwork) => (
            <article className="flex items-center gap-3 rounded border p-2" key={artwork.id}>
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border bg-muted">
                {artwork.imageUrl ? <Image src={artwork.imageUrl} alt={artwork.title} fill sizes="40px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{artwork.title}</p>
                <p className="text-muted-foreground">{artwork.status}</p>
              </div>
              <Link className="underline" href={`/my/artwork/${artwork.id}`}>Edit</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.recentActivity.map((item) => <li key={item.id}><Link className="underline" href={item.href}>{item.label}</Link></li>)}
        </ul>
      </section>
    </main>
  );
}
