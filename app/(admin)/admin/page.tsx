import Link from "next/link";
import AdminPageHeader from "./_components/AdminPageHeader";
import { db } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

async function getDbHealth() {
  try {
    await db.$queryRaw`SELECT 1`;
    return "ok" as const;
  } catch {
    return "fail" as const;
  }
}

async function getCounts() {
  try {
    const [users, artists, venues, events] = await Promise.all([
      db.user.count(),
      db.artist.count(),
      db.venue.count(),
      db.event.count(),
    ]);
    return { users, artists, venues, events };
  } catch {
    return { users: null, artists: null, venues: null, events: null };
  }
}


async function getPendingCounts() {
  try {
    const [moderationQueue, ingestQueue, ingestArtistQueue, artworks] = await Promise.all([
      db.submission.count({ where: { status: "IN_REVIEW" } }),
      db.ingestExtractedEvent.count({ where: { status: "PENDING", duplicateOfId: null } }),
      db.ingestExtractedArtist.count({ where: { status: "PENDING" } }),
      db.artwork.count({ where: { isPublished: true, deletedAt: null } }),
    ]);
    return { moderationQueue, ingestQueue, ingestArtistQueue, artworks };
  } catch {
    return { moderationQueue: null, ingestQueue: null, ingestArtistQueue: null, artworks: null };
  }
}

async function getRecentActivity() {
  try {
    return await db.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        actorEmail: true,
        action: true,
        targetType: true,
        targetId: true,
      },
    });
  } catch {
    return [];
  }
}

function formatAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, " ");
}

function StatCard({ label, value, href }: {
  label: string;
  value: number | string | null;
  href?: string;
}) {
  const card = (
    <article className={cn(
      "rounded-lg border bg-background p-4",
      href && "transition-colors hover:border-foreground/30 hover:bg-muted/50 cursor-pointer"
    )}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value ?? "—"}</p>
    </article>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

export default async function AdminHomePage() {
  const [dbHealth, counts, pending, activity] = await Promise.all([
    getDbHealth(),
    getCounts(),
    getPendingCounts(),
    getRecentActivity(),
  ]);

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Dashboard" description="Operational overview for administrators." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
        <StatCard label="DB health" value={dbHealth} />
        <StatCard label="Users" value={counts.users} href="/admin/users" />
        <StatCard label="Artists" value={counts.artists} href="/admin/artists" />
        <StatCard label="Venues" value={counts.venues} href="/admin/venues" />
        <StatCard label="Events" value={counts.events} href="/admin/events" />
        <StatCard label="Published artworks" value={pending.artworks} href="/admin/artwork" />
        <StatCard label="Moderation queue" value={pending.moderationQueue} href="/admin/moderation" />
        <StatCard label="Ingest pending" value={pending.ingestQueue} href="/admin/ingest" />
        <StatCard label="Artist candidates" value={pending.ingestArtistQueue} href="/admin/ingest/artists" />
      </div>
      {activity.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recent activity
          </h2>
          <div className="rounded-lg border bg-background divide-y">
            {activity.map((entry) => (
              <div key={entry.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="text-sm font-medium shrink-0">{entry.actorEmail}</span>
                  <span className="text-sm text-muted-foreground truncate">
                    {formatAction(entry.action)}
                    {entry.targetType ? (
                      <span className="text-muted-foreground/60"> · {entry.targetType}</span>
                    ) : null}
                  </span>
                </div>
                <time
                  className="text-xs text-muted-foreground shrink-0"
                  dateTime={entry.createdAt.toISOString()}
                  suppressHydrationWarning
                >
                  {formatRelativeTime(entry.createdAt)}
                </time>
              </div>
            ))}
          </div>
          <div className="text-right">
            <Link href="/admin/ops/audit" className="text-xs text-muted-foreground underline hover:text-foreground">
              View full audit log →
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
