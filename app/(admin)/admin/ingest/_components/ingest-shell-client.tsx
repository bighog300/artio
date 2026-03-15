"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  stats: {
    high: number;
    medium: number;
    low: number;
    total: number;
    failedLast24h: number;
    pendingArtists: number;
    pendingArtworks: number;
    activeRegions: number;
    venueGenRuns7d: number;
    pendingVenueImages: number;
  };
  children: React.ReactNode;
};

function StatCard({
  label,
  value,
  note,
  accentClassName,
}: {
  label: string;
  value: number;
  note: string;
  accentClassName?: string;
}) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className={`text-xs ${accentClassName ?? "text-muted-foreground"}`}>
        {note}
      </p>
    </article>
  );
}

export default function IngestShellClient({ stats, children }: Props) {
  const pathname = usePathname();

  return (
    <main className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-10">
        <StatCard
          label="Pending"
          value={stats.total}
          note="Pending candidates"
          accentClassName={
            stats.total > 0 ? "text-amber-700" : "text-muted-foreground"
          }
        />
        <StatCard
          label="High confidence"
          value={stats.high}
          note="Ready to approve"
          accentClassName="text-emerald-700"
        />
        <StatCard
          label="Needs review"
          value={stats.medium}
          note="Needs review"
          accentClassName={
            stats.medium > 0 ? "text-amber-700" : "text-muted-foreground"
          }
        />
        <StatCard
          label="Likely noise"
          value={stats.low}
          note="Likely noise"
          accentClassName={
            stats.low > 0 ? "text-rose-700" : "text-muted-foreground"
          }
        />
        <StatCard
          label="Failed runs (24h)"
          value={stats.failedLast24h}
          note={
            stats.failedLast24h > 0 ? "Needs attention" : "No recent failures"
          }
          accentClassName={
            stats.failedLast24h > 0 ? "text-rose-700" : "text-muted-foreground"
          }
        />
        <StatCard
          label="Active regions"
          value={stats.activeRegions}
          note={stats.activeRegions > 0 ? "Pending or running" : "None active"}
          accentClassName={stats.activeRegions > 0 ? "text-blue-700" : "text-muted-foreground"}
        />
        <StatCard
          label="Venue gen (7d)"
          value={stats.venueGenRuns7d}
          note="Generation runs this week"
        />
        <StatCard
          label="Pending images"
          value={stats.pendingVenueImages}
          note={stats.pendingVenueImages > 0 ? "Awaiting review" : "All reviewed"}
          accentClassName={stats.pendingVenueImages > 0 ? "text-amber-700" : "text-muted-foreground"}
        />
        <Link href="/admin/ingest/artists">
          <StatCard
            label="Artist candidates"
            value={stats.pendingArtists}
            note={stats.pendingArtists > 0 ? "Awaiting review" : "Queue clear"}
            accentClassName={stats.pendingArtists > 0 ? "text-amber-700" : "text-muted-foreground"}
          />
        </Link>
        <Link href="/admin/ingest/artworks">
          <StatCard
            label="Artwork candidates"
            value={stats.pendingArtworks}
            note={stats.pendingArtworks > 0 ? "Awaiting review" : "Queue clear"}
            accentClassName={stats.pendingArtworks > 0 ? "text-amber-700" : "text-muted-foreground"}
          />
        </Link>
      </section>

      <nav className="flex items-center gap-2 border-b">
        <Link
          href="/admin/ingest"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname === "/admin/ingest" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Event Queue
        </Link>
        <Link
          href="/admin/ingest/artists"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/artists") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Artists
        </Link>
        <Link
          href="/admin/ingest/artworks"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/artworks") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Artworks
        </Link>
        <Link
          href="/admin/ingest/discovery"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/discovery") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Discovery
        </Link>
        <Link
          href="/admin/ingest/regions"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/regions") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Regions
        </Link>
        <Link
          href="/admin/ingest/venue-generation"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/venue-generation") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Venue Gen
        </Link>
        <Link
          href="/admin/ingest/venue-images"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/venue-images") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Venue Images{stats.pendingVenueImages > 0 ? ` (${stats.pendingVenueImages})` : ""}
        </Link>
        <Link
          href="/admin/ingest/runs"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/runs") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Runs
        </Link>
        <Link
          href="/admin/ingest/logs"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/logs") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Logs
        </Link>
        <Link
          href="/admin/ingest/health"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/health") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Health
        </Link>
      </nav>

      {children}
    </main>
  );
}
