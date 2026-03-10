"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  stats: { high: number; medium: number; low: number; total: number; failedLast24h: number; pendingArtists: number; pendingArtworks: number };
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
      <p className={`text-xs ${accentClassName ?? "text-muted-foreground"}`}>{note}</p>
    </article>
  );
}

export default function IngestShellClient({ stats, children }: Props) {
  const pathname = usePathname();

  return (
    <main className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Pending"
          value={stats.total}
          note="Pending candidates"
          accentClassName={stats.total > 0 ? "text-amber-700" : "text-muted-foreground"}
        />
        <StatCard label="High confidence" value={stats.high} note="Ready to approve" accentClassName="text-emerald-700" />
        <StatCard
          label="Needs review"
          value={stats.medium}
          note="Needs review"
          accentClassName={stats.medium > 0 ? "text-amber-700" : "text-muted-foreground"}
        />
        <StatCard
          label="Likely noise"
          value={stats.low}
          note="Likely noise"
          accentClassName={stats.low > 0 ? "text-rose-700" : "text-muted-foreground"}
        />
        <StatCard
          label="Failed runs (24h)"
          value={stats.failedLast24h}
          note={stats.failedLast24h > 0 ? "Needs attention" : "No recent failures"}
          accentClassName={stats.failedLast24h > 0 ? "text-rose-700" : "text-muted-foreground"}
        />
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
          Artists {stats.pendingArtists > 0 ? `(${stats.pendingArtists})` : ""}
        </Link>
        <Link
          href="/admin/ingest/artworks"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/artworks") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Artworks {stats.pendingArtworks > 0 ? `(${stats.pendingArtworks})` : ""}
        </Link>
        <Link
          href="/admin/ingest/runs"
          className={`rounded-t-md px-3 py-2 text-sm ${pathname.startsWith("/admin/ingest/runs") ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Runs
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
