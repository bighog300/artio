"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
    pendingVenueImages?: number;
    pendingOnboarding?: number;
    artworksWithGaps?: number;
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

type NavItem = {
  key: string;
  label: string;
  href: string;
  badge?: number;
  badgeVariant?: "amber" | "red";
} | {
  isDivider: true;
};

function getActiveTab(pathname: string): string {
  if (pathname === "/admin/ingest") return "queue";
  if (pathname.startsWith("/admin/ingest/artists")) return "artists";
  if (pathname.startsWith("/admin/ingest/artworks")) return "artworks";
  if (pathname.startsWith("/admin/ingest/ready-to-publish")) return "publish";
  if (
    pathname.startsWith("/admin/ingest/venue-generation")
    || pathname.startsWith("/admin/ingest/venue-images")
    || pathname.startsWith("/admin/ingest/venue-onboarding")
    || pathname.startsWith("/admin/ingest/venue-map")
    || pathname.startsWith("/admin/ingest/regions")
    || pathname.startsWith("/admin/ingest/coverage")
    || pathname.startsWith("/admin/ingest/goals")
  ) return "venues";
  if (pathname.startsWith("/admin/ingest/discovery") || pathname.startsWith("/admin/ingest/directory-sources")) return "discovery";
  return "ops";
}

export default function IngestShellClient({ stats, pipelineFlags, children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const PIPELINE_FLAGS = [
    { label: "Events", on: pipelineFlags.ingestEnabled },
    { label: "Artists", on: pipelineFlags.artistIngestEnabled },
    { label: "Artworks", on: pipelineFlags.artworkIngestEnabled },
    { label: "Images", on: pipelineFlags.imageEnabled },
    { label: "Enrichment", on: pipelineFlags.venueEnrichmentEnabled },
  ];

  const PRIMARY_NAV: NavItem[] = [
    {
      key: "queue",
      label: "Event queue",
      href: "/admin/ingest",
      badge: stats.total,
      badgeVariant: "amber",
    },
    {
      key: "artists",
      label: "Artists",
      href: "/admin/ingest/artists",
      badge: stats.pendingArtists,
      badgeVariant: "amber",
    },
    {
      key: "artworks",
      label: "Artworks",
      href: "/admin/ingest/artworks",
      badge: stats.pendingArtworks,
      badgeVariant: "amber",
    },
    {
      key: "publish",
      label: "Ready to publish",
      href: "/admin/ingest/ready-to-publish",
      badge: stats.readyToPublish,
      badgeVariant: "amber",
    },
    { isDivider: true },
    { key: "venues", label: "Venues", href: "/admin/ingest/venue-generation" },
    { key: "discovery", label: "Discovery", href: "/admin/ingest/discovery" },
    { isDivider: true },
    {
      key: "ops",
      label: "Ops",
      href: "/admin/ingest/runs",
      badge: stats.failedLast24h || undefined,
      badgeVariant: stats.failedLast24h > 0 ? "red" : "amber",
    },
  ];

  const SECONDARY_NAV: Record<string, NavItem[]> = {
    venues: [
      { key: "venue-gen", label: "Generation", href: "/admin/ingest/venue-generation" },
      {
        key: "venue-images",
        label: "Images",
        href: "/admin/ingest/venue-images",
        badge: stats.pendingVenueImages ?? 0,
        badgeVariant: "amber",
      },
      {
        key: "onboarding",
        label: "Onboarding",
        href: "/admin/ingest/venue-onboarding",
        badge: stats.pendingOnboarding ?? 0,
        badgeVariant: "amber",
      },
      { key: "venue-map", label: "Map", href: "/admin/ingest/venue-map" },
      { isDivider: true },
      { key: "regions", label: "Regions", href: "/admin/ingest/regions" },
      { key: "coverage", label: "Coverage", href: "/admin/ingest/coverage" },
      { key: "goals", label: "Goals", href: "/admin/ingest/goals" },
    ],
    discovery: [
      { key: "disc-jobs", label: "Jobs", href: "/admin/ingest/discovery" },
      { key: "disc-dirs", label: "Directory sources", href: "/admin/ingest/directory-sources" },
      {
        key: "disc-perf",
        label: "Template performance",
        href: "/admin/ingest/discovery?tab=performance",
      },
      {
        key: "disc-sugg",
        label: "Suggestions",
        href: "/admin/ingest/discovery?tab=suggestions",
      },
    ],
    ops: [
      {
        key: "runs",
        label: "Runs",
        href: "/admin/ingest/runs",
        badge: stats.failedLast24h || undefined,
        badgeVariant: "red",
      },
      { key: "schedule", label: "Schedule", href: "/admin/ingest/runs?tab=schedule" },
      { key: "logs", label: "Logs", href: "/admin/ingest/runs?tab=logs" },
      { key: "health", label: "Health", href: "/admin/ingest/runs?tab=health" },
      { isDivider: true },
      { key: "enrich", label: "Enrich", href: "/admin/ingest/enrich" },
      { key: "quality", label: "Quality", href: "/admin/ingest/quality" },
      {
        key: "gaps",
        label: "Data gaps",
        href: "/admin/ingest/data-gaps",
        badge: (stats.artworksWithGaps ?? 0) || undefined,
        badgeVariant: "amber",
      },
      { key: "dupes", label: "Duplicates", href: "/admin/ingest/duplicates" },
    ],
  };

  const activeTab = getActiveTab(pathname);
  const secondaryItems = SECONDARY_NAV[activeTab];

  return (
    <main className="space-y-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
        <span className="mr-1 text-muted-foreground">Pipeline:</span>
        {PIPELINE_FLAGS.map(({ label, on }) => (
          <span
            key={label}
            className={`rounded-full px-2 py-0.5 font-medium ${on ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground line-through"}`}
          >
            {label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-3">
          {stats.failedLast24h > 0 ? (
            <Link
              href="/admin/ingest/runs?status=FAILED"
              className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
            >
              {stats.failedLast24h} failed run{stats.failedLast24h === 1 ? "" : "s"}
            </Link>
          ) : null}
          <span className="text-muted-foreground">02:50 UTC daily</span>
        </span>
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border bg-background">
        <div className="flex items-end gap-0 overflow-x-auto border-b px-1">
          {PRIMARY_NAV.map((item, i) => {
            if ("isDivider" in item) {
              return <span key={i} className="mx-2 h-4 w-px self-center bg-border" />;
            }
            const active = activeTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`mb-[-1px] flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${item.badgeVariant === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {secondaryItems ? (
          <div className="flex flex-wrap items-center gap-1 bg-muted/40 px-2 py-1.5">
            {secondaryItems.map((item, i) => {
              if ("isDivider" in item) {
                return <span key={i} className="mx-1 h-4 w-px self-center bg-border" />;
              }

              const isPathMatch = pathname.startsWith(item.href.split("?")[0]);
              const itemUrl = new URL(item.href, "https://example.local");
              const tab = itemUrl.searchParams.get("tab");
              const active = tab
                ? isPathMatch && searchParams.get("tab") === tab
                : isPathMatch && (item.key !== "disc-jobs" || !searchParams.get("tab"));

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${active ? "bg-background font-medium text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                >
                  {item.label}
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${item.badgeVariant === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {children}
    </main>
  );
}
