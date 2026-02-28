import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { ensureDbUserForSession } from "@/lib/ensure-db-user-for-session";
import { getMyDashboard } from "@/lib/my/dashboard/get-my-dashboard";
import CompletenessBar from "./_components/CompletenessBar";
import StatusTileGroups from "./_components/StatusTileGroups";
import NeedsAttentionPanel from "./_components/NeedsAttentionPanel";

function venuePrimaryAction(venue: {
  id: string;
  status: "Draft" | "Submitted" | "Published" | "Rejected";
  completeness?: { percent: number } | null;
}) {
  const percent = venue.completeness?.percent ?? 0;

  if (venue.status === "Submitted") {
    return { label: "Pending review", href: null, className: "cursor-not-allowed rounded border px-2 py-1 text-muted-foreground" };
  }

  if (venue.status === "Published") {
    return { label: "+ New event", href: `/my/events/new?venueId=${venue.id}`, className: "rounded border px-2 py-1 underline" };
  }

  if (venue.status === "Rejected") {
    return { label: "Fix & resubmit", href: `/my/venues/${venue.id}`, className: "rounded border border-destructive/40 px-2 py-1 text-destructive underline" };
  }

  if (percent >= 80) {
    return { label: "Submit for review", href: `/my/venues/${venue.id}`, className: "rounded border px-2 py-1 underline" };
  }

  return { label: "Complete profile", href: `/my/venues/${venue.id}`, className: "rounded border px-2 py-1 underline" };
}

export default async function MyDashboardPage({ searchParams }: { searchParams: Promise<{ venueId?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");
  const dbUser = await ensureDbUserForSession(user);

  const { venueId } = await searchParams;
  const data = await getMyDashboard({ userId: dbUser?.id ?? user.id, venueId });
  const shouldShowOnboarding = data.quickLists.venues.length === 0 && data.quickLists.upcomingEvents.length === 0;

  return (
    <main className="space-y-4">
      <NeedsAttentionPanel attention={data.attention} />

      <StatusTileGroups counts={data.counts} venueId={venueId} />

      {shouldShowOnboarding ? (
        <section className="rounded border p-3">
          <h2 className="text-lg font-semibold">Get set up</h2>
          <ol className="mt-2 list-inside list-decimal text-sm text-muted-foreground">
            <li>Create your venue</li>
            <li>Add images and location details</li>
            <li>Create your first event</li>
            <li>Submit for review</li>
          </ol>
          <div className="mt-3">
            <Link className="inline-flex rounded border px-3 py-1.5 text-sm font-medium" href="/my/venues/new">Create venue</Link>
          </div>
        </section>
      ) : null}

      <section className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Venues</h2>
          <Link className="text-sm underline" href={venueId ? `/my/venues?venueId=${venueId}` : "/my/venues"}>View all</Link>
        </div>
        <div className="space-y-2 text-sm">
          {data.quickLists.venues.length === 0 ? <p className="rounded border p-2 text-muted-foreground">You haven&apos;t created any venues yet. <Link className="underline" href="/my/venues/new">Create Venue</Link></p> : data.quickLists.venues.map((venue) => {
            const action = venuePrimaryAction(venue);

            return (
              <article className="rounded border p-2" key={venue.id}>
                <p className="font-medium">{venue.name}</p>
                <p className="text-muted-foreground">{venue.status} · {new Date(venue.updatedAtISO).toLocaleDateString()}</p>
                {venue.completeness ? <CompletenessBar percent={venue.completeness.percent} missing={venue.completeness.missing} /> : null}
                <div className="mt-2 space-y-1">
                  <div>
                    {action.href ? (
                      <Link className={action.className} href={action.href}>{action.label}</Link>
                    ) : (
                      <span className={action.className} aria-disabled>{action.label}</span>
                    )}
                  </div>
                  <div className="space-x-2">
                    <Link className="underline" href={`/my/venues/${venue.id}`}>Edit venue</Link>
                    <Link className="underline" href={`/my/events?venueId=${venue.id}`}>View events</Link>
                    {venue.status === "Published" ? <Link className="underline" href={`/venues/${venue.id}`}>View Public</Link> : null}
                  </div>
                </div>
              </article>
            );
          })}
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
