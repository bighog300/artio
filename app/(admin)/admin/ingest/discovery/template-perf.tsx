"use client";

import type { TemplatePerfRow } from "@/lib/discovery/template-perf-query";

type Props = {
  rows: TemplatePerfRow[];
  entityTypeFilter: "ALL" | "VENUE" | "ARTIST";
  onFilterChange: (f: "ALL" | "VENUE" | "ARTIST") => void;
};

function timeAgo(value: Date | null) {
  if (!value) return "Never";
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  return rtf.format(Math.round(diffHr / 24), "day");
}

function chipClass(active: boolean) {
  return active
    ? "rounded-full bg-muted px-2 py-1 text-xs font-medium"
    : "rounded-full px-2 py-1 text-xs text-muted-foreground";
}

function trendCell(trend: TemplatePerfRow["trend"]) {
  if (trend === "up") return <span className="text-emerald-700">↑</span>;
  if (trend === "down") return <span className="text-rose-700">↓</span>;
  if (trend === "flat") return <span className="text-muted-foreground">→</span>;
  return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">new</span>;
}

function yieldColor(yieldPct: number) {
  if (yieldPct >= 30) return "bg-emerald-500";
  if (yieldPct >= 10) return "bg-amber-500";
  return "bg-rose-500";
}

export function TemplatePerfPanel({ rows, entityTypeFilter, onFilterChange }: Props) {
  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chipClass(entityTypeFilter === "ALL")} onClick={() => onFilterChange("ALL")}>All</button>
        <button type="button" className={chipClass(entityTypeFilter === "VENUE")} onClick={() => onFilterChange("VENUE")}>Venues</button>
        <button type="button" className={chipClass(entityTypeFilter === "ARTIST")} onClick={() => onFilterChange("ARTIST")}>Artists</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Template</th>
              <th className="py-2 pr-3">Entity</th>
              <th className="py-2 pr-3">Region</th>
              <th className="py-2 pr-3">Jobs</th>
              <th className="py-2 pr-3">Avg yield</th>
              <th className="py-2 pr-3">Queued</th>
              <th className="py-2 pr-3">Skipped</th>
              <th className="py-2 pr-3">Trend</th>
              <th className="py-2 pr-3">Last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const yieldPct = Number((row.avgYield * 100).toFixed(1));
              return (
                <tr key={`${row.queryTemplate}-${row.entityType}-${row.region}`} className="border-b align-top last:border-0">
                  <td className="max-w-[420px] truncate py-3 pr-3" title={row.queryTemplate}>{row.queryTemplate}</td>
                  <td className="py-3 pr-3">{row.entityType}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{row.region || "—"}</td>
                  <td className="py-3 pr-3">{row.jobCount}</td>
                  <td className="py-3 pr-3">
                    {row.avgYield === 0 && row.jobCount === 0 ? (
                      <span className="text-muted-foreground">No data</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded bg-muted">
                          <div className={`h-full ${yieldColor(yieldPct)}`} style={{ width: `${Math.min(yieldPct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{yieldPct.toFixed(1)}%</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3">{row.totalQueued}</td>
                  <td className="py-3 pr-3">{row.totalSkipped}</td>
                  <td className="py-3 pr-3">{trendCell(row.trend)}</td>
                  <td className="py-3 pr-3 text-muted-foreground" suppressHydrationWarning>{timeAgo(row.lastRunAt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  No template performance data yet. Performance data accumulates after discovery jobs complete.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
