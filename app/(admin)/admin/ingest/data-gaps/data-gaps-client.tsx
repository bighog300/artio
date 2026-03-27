"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Artwork = {
  id: string;
  title: string;
  slug: string | null;
  completenessScore: number;
  completenessFlags: string[];
  completenessUpdatedAt: Date | null;
  medium: string | null;
  year: number | null;
  featuredAssetId: string | null;
  artist: { id: string; name: string; slug: string };
};

type Props = {
  artworks: Artwork[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentFlag: string | null;
  flagCounts: Array<{ flag: string; count: number }>;
};

const flagLabel: Record<string, string> = {
  MISSING_IMAGE: "No image",
  LOW_CONFIDENCE_METADATA: "Low confidence",
  INCOMPLETE: "Incomplete",
};

const flagPillClass: Record<string, string> = {
  MISSING_IMAGE: "bg-red-100 text-red-800",
  LOW_CONFIDENCE_METADATA: "bg-amber-100 text-amber-900",
  INCOMPLETE: "bg-amber-100 text-amber-900",
};

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function formatScoredAt(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
    >
      {label}
    </button>
  );
}

export function DataGapsClient({ artworks, total, totalPages, currentPage, currentFlag, flagCounts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilters(next: { flag?: string | null; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.flag !== undefined) {
      if (next.flag) params.set("flag", next.flag);
      else params.delete("flag");
      params.set("page", "1");
    }

    if (next.page !== undefined) {
      params.set("page", String(next.page));
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (artworks.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
        No artworks with data gaps. Run the scoring cron first.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      {artworks[0]?.completenessUpdatedAt === null ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Completeness scores have not been computed yet. Trigger the scoring cron at /api/cron/artworks/score-completeness to populate this view.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={!currentFlag}
          label={`All gaps (${total})`}
          onClick={() => updateFilters({ flag: null })}
        />
        {flagCounts.map((item) => (
          <FilterChip
            key={item.flag}
            active={currentFlag === item.flag}
            label={`${flagLabel[item.flag] ?? item.flag} (${item.count})`}
            onClick={() => updateFilters({ flag: item.flag })}
          />
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Score</th>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Artist</th>
              <th className="py-2 pr-3">Flags</th>
              <th className="py-2 pr-3">Medium</th>
              <th className="py-2 pr-3">Year</th>
              <th className="py-2 pr-3">Last scored</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((artwork) => (
              <tr key={artwork.id} className="border-b align-top last:border-0">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                      <div className={`h-full ${scoreTone(artwork.completenessScore)}`} style={{ width: `${artwork.completenessScore}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{artwork.completenessScore}%</span>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <Link href={`/admin/artwork/${artwork.id}`} className="font-medium underline">
                    {artwork.title || "Untitled"}
                  </Link>
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{artwork.artist?.name ?? "—"}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1.5">
                    {artwork.completenessFlags.map((flag) => (
                      <span
                        key={`${artwork.id}-${flag}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${flagPillClass[flag] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {flagLabel[flag] ?? flag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{artwork.medium ?? "—"}</td>
                <td className="py-3 pr-3 text-muted-foreground">{artwork.year ?? "—"}</td>
                <td className="py-3 pr-3 text-muted-foreground">{formatScoredAt(artwork.completenessUpdatedAt)}</td>
                <td className="py-3 text-right">
                  <Link href={`/admin/artwork/${artwork.id}`} className="text-xs underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span>Page {currentPage} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage <= 1}
            onClick={() => updateFilters({ page: currentPage - 1 })}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage >= totalPages}
            onClick={() => updateFilters({ page: currentPage + 1 })}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
