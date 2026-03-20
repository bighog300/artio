"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VenueStatus = {
  lastRunAt: string;
  lastRunStatus: string;
  pendingCount: number;
};

type Props = {
  venues: Array<{ id: string; name: string }>;
};

function relativeTime(iso: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return Math.round(abs / 60_000) + "m ago";
  if (abs < 86_400_000) return Math.round(abs / 3_600_000) + "hr ago";
  return Math.round(abs / 86_400_000) + "d ago";
}

export default function VenueIngestStatusPanel({ venues }: Props) {
  const [statusMap, setStatusMap] = useState<Record<string, VenueStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/venues/ingest-status")
      .then((r) => r.json())
      .then((data: { status: Record<string, VenueStatus> }) => {
        setStatusMap(data.status);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Only show venues that have either run history or pending candidates
  const venuesWithActivity = venues.filter((v) => statusMap[v.id] !== undefined);

  if (loading) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <p className="text-sm text-muted-foreground">Loading ingest status…</p>
      </div>
    );
  }

  if (venuesWithActivity.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          No ingest runs recorded yet. Use the{" "}
          <Link href="/admin/ingest/runs" className="underline">
            Trigger / Runs
          </Link>{" "}
          tab to start extracting events.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="mb-3 text-base font-semibold">Venue ingest status</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Venue</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Pending</th>
            </tr>
          </thead>
          <tbody>
            {venuesWithActivity.map((venue) => {
              const s = statusMap[venue.id];
              return (
                <tr key={venue.id} className="border-b align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/venues/${venue.id}`} className="underline">
                      {venue.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.lastRunAt ? relativeTime(s.lastRunAt) : "never"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        s.lastRunStatus === "SUCCEEDED"
                          ? "text-emerald-600"
                          : s.lastRunStatus === "FAILED"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {s.lastRunStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {s.pendingCount > 0 ? (
                      <Link
                        href="/admin/ingest"
                        className="font-medium text-amber-700 underline dark:text-amber-400"
                      >
                        {s.pendingCount} pending
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
