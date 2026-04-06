import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { getMyDashboard } from "@/lib/my/dashboard/get-my-dashboard";
import type { MyDashboardResponse } from "@/lib/my/dashboard-schema";
import NeedsAttentionPanel from "@/app/my/_components/NeedsAttentionPanel";
import StatusTileGroups from "@/app/my/_components/StatusTileGroups";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestPublisherAccessCard } from "@/components/my/request-publisher-access-card";
import { PageShell } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { publisherStatusVariant } from "@/lib/publisher-status-variant";
import Link from "next/link";
import Image from "next/image";
import PublisherApprovalBanner from "@/components/my/PublisherApprovalBanner";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ venueId?: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ABSOLUTE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAbsoluteDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
  return ABSOLUTE_DATE_FORMATTER.format(parsed);
}

function formatRelative(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "just now";
  const diffMs = Date.now() - parsed.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diffSeconds < 172800) return "yesterday";
  if (diffSeconds < 604800) {
    const days = Math.floor(diffSeconds / 86400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  const weeks = Math.floor(diffSeconds / 604800);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  return formatAbsoluteDate(iso);
}

function QuickListsPanel({ quickLists }: { quickLists: MyDashboardResponse["quickLists"] }) {
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">Quick lists</h2>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-base font-semibold">Venues</h3>
        {quickLists.venues.length ? (
          <ul className="space-y-3">
            {quickLists.venues.map((venue) => (
              <li key={venue.id}>
                <Link className="block rounded-md border p-3 transition-colors hover:bg-muted/30" href={`/my/venues/${venue.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{venue.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{venue.role}</Badge>
                      <Badge variant={publisherStatusVariant(venue.status)}>{venue.status}</Badge>
                    </div>
                  </div>
                  {venue.completeness ? (
                    <div className="mt-3 space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${venue.completeness.percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {venue.completeness.percent}% complete
                        {venue.completeness.missing.length
                          ? ` · Missing: ${venue.completeness.missing.slice(0, 3).join(", ")}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No venues yet — <Link className="underline" href="/my/venues/new">create one</Link>.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-base font-semibold">Upcoming events</h3>
        {quickLists.upcomingEvents.length ? (
          <ul className="space-y-2">
            {quickLists.upcomingEvents.map((event) => (
              <li key={event.id}>
                <Link className="block rounded-md border p-3 transition-colors hover:bg-muted/30" href={`/my/events/${event.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.venueName ?? "No venue"} · {formatAbsoluteDate(event.startAtISO)}
                      </p>
                    </div>
                    <Badge variant={publisherStatusVariant(event.status)}>{event.status}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No upcoming events — <Link className="underline" href="/my/events/new">create one</Link>.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-base font-semibold">Recent artwork</h3>
        {quickLists.recentArtwork.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLists.recentArtwork.map((artwork) => (
              <li key={artwork.id}>
                <Link className="block h-full overflow-hidden rounded-md border transition-colors hover:bg-muted/30" href={`/my/artwork/${artwork.id}`}>
                  <div className="relative aspect-[4/3] bg-muted">
                    {artwork.imageUrl ? (
                      <Image
                        alt={artwork.title}
                        className="object-cover"
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        src={artwork.imageUrl}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-1 font-medium">{artwork.title}</p>
                    <Badge variant={publisherStatusVariant(artwork.status)}>{artwork.status}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No artwork yet — <Link className="underline" href="/my/artwork/new">add one</Link>.
          </p>
        )}
      </div>
    </section>
  );
}

function RecentActivityFeed({ recentActivity }: { recentActivity: MyDashboardResponse["recentActivity"] }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Recent activity</h2>
      {recentActivity.length ? (
        <ol className="space-y-2">
          {recentActivity.slice(0, 8).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <Link className="font-medium underline-offset-2 hover:underline" href={item.href}>
                {item.label}
              </Link>
              <time className="text-xs text-muted-foreground" dateTime={item.occurredAtISO}>
                {formatRelative(item.occurredAtISO)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No recent activity yet.</p>
      )}
    </section>
  );
}

export default async function MyDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");

  const params = await searchParams;
  const rawVenueId = params.venueId;
  const venueId =
    rawVenueId && rawVenueId.trim().length > 0 && UUID_RE.test(rawVenueId.trim())
      ? rawVenueId.trim()
      : undefined;

  const data = await getMyDashboard({ userId: user.id, venueId });
  const hasAnyContent =
    data.counts.venues.Draft > 0 || data.counts.venues.Published > 0 ||
    data.counts.events.Draft > 0 || data.counts.events.Published > 0 ||
    data.counts.artwork.Draft > 0 || data.counts.artwork.Published > 0;
  const hasVenueAccess = Object.values(data.counts.venues).some((count) => count > 0);

  if (!hasAnyContent) {
    return (
      <PageShell className="page-stack">
        <EmptyState
          title="Welcome to your publisher hub"
          body="Start by creating a venue. Once you have a venue, you can publish events and manage your team."
          actions={[
            { label: "Create a venue", href: "/my/venues/new" },
            { label: "Set up artist profile", href: "/my/artist", variant: "secondary" },
          ]}
        />
        {!hasVenueAccess ? <RequestPublisherAccessCard currentRole={user.role} /> : null}
      </PageShell>
    );
  }

  return (
    <PageShell className="page-stack">
      {data.publisherNotice ? <PublisherApprovalBanner noticeId={data.publisherNotice.noticeId} /> : null}
      <NeedsAttentionPanel attention={data.attention} />
      <QuickListsPanel quickLists={data.quickLists} />
      <StatusTileGroups counts={data.counts} venueId={venueId} />
      <RecentActivityFeed recentActivity={data.recentActivity} />
      {!hasVenueAccess ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Want to publish venues and events?</h2>
          <RequestPublisherAccessCard currentRole={user.role} />
        </section>
      ) : null}
    </PageShell>
  );
}
