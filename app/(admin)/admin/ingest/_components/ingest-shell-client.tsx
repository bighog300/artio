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
    readyToPublish: number;
    activeRegions: number;
    venueGenRuns7d: number;
    pendingVenueImages: number;
    pendingOnboarding: number;
  };
  pipelineFlags: {
    ingestEnabled: boolean;
    artistIngestEnabled: boolean;
    artworkIngestEnabled: boolean;
    imageEnabled: boolean;
    venueEnrichmentEnabled: boolean;
  };
  children: React.ReactNode;
};

function StatCard({
  label,
  value,
  note,
  accentClassName,
  href,
  urgent,
}: {
  label: string;
  value: number;
  note: string;
  accentClassName?: string;
  href?: string;
  urgent?: boolean;
}) {
  const content = (
    <article
      className={`rounded-lg border bg-background p-3 transition-colors ${
        urgent && value > 0 ? "border-amber-300 bg-amber-50/50" : ""
      } ${href ? "cursor-pointer hover:bg-muted/40" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${
        urgent && value > 0
          ? "text-amber-700"
          : accentClassName ?? "text-muted-foreground"
      }`}>{value}</p>
      <p className={`text-xs ${
        urgent && value > 0
          ? "text-amber-700"
          : accentClassName ?? "text-muted-foreground"
      }`}>
        {note}
      </p>
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

function ConfidenceBar({
  high,
  medium,
  low,
}: {
  high: number;
  medium: number;
  low: number;
}) {
  const total = high + medium + low;
  if (total === 0) return null;

  const highPct = Math.round((high / total) * 100);
  const medPct = Math.round((medium / total) * 100);
  const lowPct = 100 - highPct - medPct;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Queue confidence ratio</p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {highPct > 0 ? (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${highPct}%` }}
            title={`HIGH: ${high} (${highPct}%)`}
          />
        ) : null}
        {medPct > 0 ? (
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${medPct}%` }}
            title={`MEDIUM: ${medium} (${medPct}%)`}
          />
        ) : null}
        {lowPct > 0 ? (
          <div
            className="bg-rose-400 transition-all"
            style={{ width: `${lowPct}%` }}
            title={`LOW: ${low} (${lowPct}%)`}
          />
        ) : null}
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        {highPct > 0 ? <span className="text-emerald-700">{highPct}% HIGH</span> : null}
        {medPct > 0 ? <span className="text-amber-700">{medPct}% MEDIUM</span> : null}
        {lowPct > 0 ? <span className="text-rose-700">{lowPct}% LOW</span> : null}
      </div>
    </div>
  );
}

export default function IngestShellClient({ stats, pipelineFlags, children }: Props) {
  const pathname = usePathname();

  return (
    <main className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-11">
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
          urgent
          href="/admin/ingest/runs?status=FAILED"
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
          urgent
          href="/admin/ingest/venue-images"
        />
        <StatCard
          label="Venues to onboard"
          value={stats.pendingOnboarding}
          note={stats.pendingOnboarding > 0 ? "Awaiting review" : "Queue clear"}
          urgent
          href="/admin/ingest/venue-onboarding"
        />
        <StatCard
          label="Artist candidates"
          value={stats.pendingArtists}
          note={stats.pendingArtists > 0 ? "Awaiting review" : "Queue clear"}
          urgent
          href="/admin/ingest/artists"
        />
        <StatCard
          label="Artwork candidates"
          value={stats.pendingArtworks}
          note={stats.pendingArtworks > 0 ? "Awaiting review" : "Queue clear"}
          urgent
          href="/admin/ingest/artworks"
        />
      </section>

      <ConfidenceBar high={stats.high} medium={stats.medium} low={stats.low} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Pipeline:</span>
        {[
          { label: "Events", on: pipelineFlags.ingestEnabled },
          { label: "Artists", on: pipelineFlags.artistIngestEnabled },
          { label: "Artworks", on: pipelineFlags.artworkIngestEnabled },
          { label: "Images", on: pipelineFlags.imageEnabled },
          { label: "Enrichment", on: pipelineFlags.venueEnrichmentEnabled },
        ].map(({ label, on }) => (
          <span
            key={label}
            className={`rounded-full px-2 py-0.5 font-medium ${
              on
                ? "bg-emerald-100 text-emerald-800"
                : "bg-muted text-muted-foreground line-through"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <nav className="flex items-end gap-0 overflow-x-auto border-b">
        <div className="flex flex-col">
          <span
            className="hidden select-none px-2 pb-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 lg:block"
            aria-hidden="true"
          >
            Review
          </span>
          <div className="flex items-end">
            <Link
              href="/admin/ingest"
              className={`rounded-t-md px-3 py-2 text-sm ${pathname === "/admin/ingest" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                Event Queue
                {stats.total > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.total}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link
              href="/admin/ingest/artists"
              className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/artists") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                Artists
                {stats.pendingArtists > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.pendingArtists}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link
              href="/admin/ingest/artworks"
              className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/artworks") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                Artworks
                {stats.pendingArtworks > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.pendingArtworks}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link
              href="/admin/ingest/ready-to-publish"
              className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/ready-to-publish") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                Ready to Publish
                {stats.readyToPublish > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.readyToPublish}
                  </span>
                ) : null}
              </span>
            </Link>
          </div>
        </div>

        <span
          className="mx-2 self-stretch border-l border-border/60"
          aria-hidden="true"
        />
        <div className="flex flex-col">
          <span
            className="hidden select-none px-2 pb-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 lg:block"
            aria-hidden="true"
          >
            Pipeline
          </span>
          <div className="flex items-end">
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
              <span className="flex items-center gap-1.5">
                Venue Images
                {stats.pendingVenueImages > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.pendingVenueImages}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link
              href="/admin/ingest/venue-onboarding"
              className={`rounded-t-md px-3 py-2 text-sm ${
                pathname.startsWith("/admin/ingest/venue-onboarding")
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                Onboarding
                {stats.pendingOnboarding > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                    {stats.pendingOnboarding}
                  </span>
                ) : null}
              </span>
            </Link>
          </div>
        </div>

        <span
          className="mx-2 self-stretch border-l border-border/60"
          aria-hidden="true"
        />
        <div className="flex flex-col">
          <span
            className="hidden select-none px-2 pb-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 lg:block"
            aria-hidden="true"
          >
            Operations
          </span>
          <div className="flex items-end">
            <Link
              href="/admin/ingest/runs"
              className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/runs") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Trigger / Runs
            </Link>
            <Link
              href="/admin/ingest/venue-map"
              className={`rounded-t-md px-3 py-2 text-sm ${
                pathname.startsWith("/admin/ingest/venue-map")
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Venue Map
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
          </div>
        </div>
      </nav>

      {children}
    </main>
  );
}
