"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VenueRow = {
  id: string;
  name: string;
  ingestFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL";
};

type VenueStatus = {
  lastRunAt: string;
  lastRunStatus: string;
  pendingCount: number;
};

const COOLDOWN_MS: Record<string, number> = {
  DAILY: 20 * 60 * 60 * 1000,
  WEEKLY: 6 * 24 * 60 * 60 * 1000,
  MONTHLY: 25 * 24 * 60 * 60 * 1000,
  MANUAL: Infinity,
};

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  MANUAL: "Manual",
};

function relativeTime(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return "now";
  if (abs < 3_600_000) return Math.round(abs / 60_000) + "m";
  if (abs < 86_400_000) return Math.round(abs / 3_600_000) + "hr";
  return Math.round(abs / 86_400_000) + "d";
}

function nextDueLabel(
  lastRunAt: string | undefined,
  frequency: string,
): { label: string; overdue: boolean } {
  if (frequency === "MANUAL") return { label: "manual only", overdue: false };
  const cooldown = COOLDOWN_MS[frequency] ?? COOLDOWN_MS.WEEKLY;
  if (!lastRunAt) return { label: "now", overdue: true };
  const dueAt = new Date(lastRunAt).getTime() + cooldown;
  const diff = dueAt - Date.now();
  if (diff <= 0) return { label: "overdue by " + relativeTime(diff), overdue: true };
  return { label: "in " + relativeTime(diff), overdue: false };
}

function FrequencyCell({
  venueId,
  initial,
}: {
  venueId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestFrequency: next }),
      });
      if (!res.ok) setError("Save failed");
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded border px-1.5 py-0.5 text-xs"
        value={value}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
      >
        {["DAILY", "WEEKLY", "MONTHLY", "MANUAL"].map((opt) => (
          <option key={opt} value={opt}>
            {FREQ_LABELS[opt]}
          </option>
        ))}
      </select>
      {saving ? <span className="text-xs text-muted-foreground">…</span> : null}
      {error ? <span className="text-xs text-destructive">!</span> : null}
    </div>
  );
}

export function SchedulePanel({ venues }: { venues: VenueRow[] }) {
  const [statusMap, setStatusMap] = useState<Record<string, VenueStatus>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "due" | "manual">("all");

  useEffect(() => {
    fetch("/api/admin/venues/ingest-status")
      .then((r) => r.json())
      .then((data: { status: Record<string, VenueStatus> }) =>
        setStatusMap(data.status),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rows = venues
    .filter((v) => {
      if (filter === "manual") return v.ingestFrequency === "MANUAL";
      if (filter === "due") {
        const s = statusMap[v.id];
        const { overdue } = nextDueLabel(s?.lastRunAt, v.ingestFrequency);
        return overdue;
      }
      return true;
    })
    .map((v) => {
      const s = statusMap[v.id];
      const { label: nextDue, overdue } = nextDueLabel(
        s?.lastRunAt,
        v.ingestFrequency,
      );
      return { venue: v, status: s, nextDue, overdue };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (
        a.venue.ingestFrequency === "MANUAL" &&
        b.venue.ingestFrequency !== "MANUAL"
      ) {
        return 1;
      }
      if (
        b.venue.ingestFrequency === "MANUAL" &&
        a.venue.ingestFrequency !== "MANUAL"
      ) {
        return -1;
      }
      return a.venue.name.localeCompare(b.venue.name);
    });

  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <section className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Venue schedule</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : overdueCount > 0
                ? `${overdueCount} venue${overdueCount === 1 ? "" : "s"} due to run · ${venues.length} total`
                : `${venues.length} venues · all up to date`}
          </p>
        </div>
        <div className="flex gap-1">
          {(["all", "due", "manual"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`rounded border px-2 py-1 text-xs ${
                filter === f
                  ? "border-foreground bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "due" ? "Due now" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Venue</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2">Next due</th>
              <th className="px-3 py-2">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ venue, status, nextDue, overdue }) => (
              <tr key={venue.id} className="border-b align-middle">
                <td className="px-3 py-2">
                  <Link href={`/admin/venues/${venue.id}`} className="underline">
                    {venue.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <FrequencyCell venueId={venue.id} initial={venue.ingestFrequency} />
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs" suppressHydrationWarning>
                  {status?.lastRunAt
                    ? relativeTime(Date.now() - new Date(status.lastRunAt).getTime()) +
                      " ago"
                    : "never"}
                  {status?.lastRunStatus === "FAILED" ? (
                    <span className="ml-1 text-destructive">✗</span>
                  ) : status?.lastRunStatus === "SUCCEEDED" ? (
                    <span className="ml-1 text-emerald-600">✓</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs" suppressHydrationWarning>
                  <span
                    className={
                      overdue
                        ? "font-medium text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground"
                    }
                  >
                    {nextDue}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {status?.pendingCount ? (
                    <Link
                      href="/admin/ingest"
                      className="font-medium text-amber-700 underline dark:text-amber-400"
                    >
                      {status.pendingCount}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {filter === "due"
                    ? "No venues currently due."
                    : filter === "manual"
                      ? "No venues set to manual."
                      : "No venues with a website URL."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
