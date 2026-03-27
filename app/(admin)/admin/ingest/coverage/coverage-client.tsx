"use client";

import Link from "next/link";
import type { RegionCoverageRow } from "@/lib/discovery/coverage-query";

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

function goalTone(seeded: number, targetCount: number) {
  if (targetCount <= 0) return "bg-rose-500";
  if (seeded >= targetCount) return "bg-emerald-500";
  if (seeded >= targetCount * 0.5) return "bg-amber-500";
  return "bg-rose-500";
}

export function CoverageClient({ rows }: { rows: RegionCoverageRow[] }) {
  const regionsWithPublished = rows.filter((row) => row.publishedVenues > 0).length;
  const regionsWithActiveGoals = rows.filter((row) => row.activeGoal !== null).length;
  const regionsWithEvents = rows.filter((row) => row.venuesWithApprovedEvents > 0).length;

  if (rows.length === 0) {
    return (
      <section className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
        No regions found. Add regions in the Regions tab to start tracking coverage.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          Total regions: {rows.length}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          Regions with published venues: {regionsWithPublished}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          Regions with active goals: {regionsWithActiveGoals}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          Venues with events: {regionsWithEvents}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Region</th>
              <th className="py-2 pr-3">Country</th>
              <th className="py-2 pr-3">Venues</th>
              <th className="py-2 pr-3">Published</th>
              <th className="py-2 pr-3">Events (30d)</th>
              <th className="py-2 pr-3">Approved events</th>
              <th className="py-2 pr-3">Active venues</th>
              <th className="py-2 pr-3">Last discovery</th>
              <th className="py-2 pr-3">Goal progress</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = row.activeGoal && row.activeGoal.targetCount > 0
                ? Math.min((row.activeGoal.seeded / row.activeGoal.targetCount) * 100, 100)
                : 0;

              return (
                <tr key={`${row.region}-${row.country}`} className="border-b align-top last:border-0">
                  <td className="py-3 pr-3 font-medium">{row.region}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{row.country}</td>
                  <td className={`py-3 pr-3 ${row.totalVenues > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {row.totalVenues}
                  </td>
                  <td className={`py-3 pr-3 ${row.publishedVenues > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {row.publishedVenues}
                  </td>
                  <td className={`py-3 pr-3 ${row.eventsLast30d > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                    {row.eventsLast30d}
                  </td>
                  <td className={`py-3 pr-3 ${row.totalApprovedEvents > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {row.totalApprovedEvents > 0 ? row.totalApprovedEvents : "—"}
                  </td>
                  <td className={`py-3 pr-3 ${row.venuesWithApprovedEvents > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {row.venuesWithApprovedEvents > 0 ? row.venuesWithApprovedEvents : "—"}
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{timeAgo(row.lastDiscoveryRun)}</td>
                  <td className="py-3 pr-3">
                    {row.activeGoal ? (
                      <div className="space-y-1">
                        <div className="h-1.5 w-28 overflow-hidden rounded bg-muted">
                          <div
                            className={`h-full ${goalTone(row.activeGoal.seeded, row.activeGoal.targetCount)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {row.activeGoal.seeded} / {row.activeGoal.targetCount} seeded
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        — {" "}
                        <Link href="/admin/ingest/goals" className="underline">
                          Create goal →
                        </Link>
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-xs">
                    <Link
                      href={`/admin/ingest/discovery?region=${encodeURIComponent(row.region)}`}
                      className="underline"
                    >
                      Run discovery →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
