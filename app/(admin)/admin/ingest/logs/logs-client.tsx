"use client";

import Link from "next/link";
import { useState } from "react";
import type { CronRuntimeState } from "@/lib/cron-state";

type RunFailure = {
  id: string;
  createdAt: string;
  status: string;
  sourceUrl: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetail: string | null;
  durationMs: number | null;
  venue: { id: string; name: string };
};

type CandidateRejection = {
  id: string;
  title: string;
  createdAt: string;
  status: string;
  confidenceScore: number | null;
  confidenceBand: string | null;
  rejectionReason: string | null;
  venue: { id: string; name: string };
  run: { id: string } | null;
};

type Props = {
  cronState: Record<string, CronRuntimeState>;
  initialRunFailures: RunFailure[];
  initialCandidateRejections: CandidateRejection[];
};

const CRON_LABELS: Record<string, string> = {
  ingest_regions: "Region Ingest",
  ingest_venues: "Venue Ingest",
  ingest_discovery: "Discovery",
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return Math.round(abs / 60_000) + " min ago";
  if (abs < 86_400_000) return Math.round(abs / 3_600_000) + " hr ago";
  return Math.round(abs / 86_400_000) + " days ago";
}

function DaysFilter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 7, 30].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`rounded px-2 py-1 text-xs ${value === d ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
        >
          {d === 1 ? "Today" : `${d}d`}
        </button>
      ))}
    </div>
  );
}

export default function LogsClient({ cronState, initialRunFailures, initialCandidateRejections }: Props) {
  const [runFailures, setRunFailures] = useState(initialRunFailures);
  const [candidateRejections, setCandidateRejections] = useState(initialCandidateRejections);
  const [runDays, setRunDays] = useState(7);
  const [candidateDays, setCandidateDays] = useState(7);
  const [errorCodeFilter, setErrorCodeFilter] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  async function fetchRunFailures(days: number, errorCode: string) {
    setLoadingRuns(true);
    try {
      const params = new URLSearchParams({ days: String(days), errorCode });
      const res = await fetch(`/api/admin/ingest/logs/runs?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { runs: RunFailure[] };
        setRunFailures(data.runs);
      }
    } finally {
      setLoadingRuns(false);
    }
  }

  async function fetchCandidateRejections(days: number) {
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/admin/ingest/logs/candidates?days=${days}`);
      if (res.ok) {
        const data = (await res.json()) as { candidates: CandidateRejection[] };
        setCandidateRejections(data.candidates);
      }
    } finally {
      setLoadingCandidates(false);
    }
  }

  const ingestCronNames = ["ingest_regions", "ingest_venues", "ingest_discovery"];

  return (
    <div className="space-y-6">
      {/* Panel 1 — Cron Summary */}
      <section className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">Cron Summary</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ingestCronNames.map((name) => {
            const state = cronState[name] as CronRuntimeState | undefined;
            const hasError = Boolean(state?.lastErrorAt);
            const lastSuccess = state?.lastSuccessAt;
            const lastError = state?.lastErrorAt;
            const errorSummary = state?.lastErrorSummary;
            return (
              <div
                key={name}
                className={`rounded-lg border p-3 ${hasError && (!lastSuccess || new Date(lastError!) > new Date(lastSuccess)) ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
              >
                <p className="text-xs font-medium text-foreground">{CRON_LABELS[name] ?? name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last success: <span className="text-foreground">{relativeTime(lastSuccess)}</span>
                </p>
                {lastError ? (
                  <>
                    <p className="text-xs text-destructive">Last error: {relativeTime(lastError)}</p>
                    {errorSummary ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={errorSummary}>
                        {errorSummary.slice(0, 80)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {!state ? <p className="mt-1 text-xs text-muted-foreground">No runs recorded yet.</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Panel 2 — Ingest Run Errors */}
      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Ingest Run Failures</h2>
          <DaysFilter
            value={runDays}
            onChange={(d) => {
              setRunDays(d);
              void fetchRunFailures(d, errorCodeFilter);
            }}
          />
          <input
            className="rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="Filter by error code…"
            value={errorCodeFilter}
            onChange={(e) => {
              setErrorCodeFilter(e.target.value);
              void fetchRunFailures(runDays, e.target.value);
            }}
          />
          {loadingRuns ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
        </div>
        {runFailures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No run failures in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Venue</th>
                  <th className="px-2 py-2">Error Code</th>
                  <th className="px-2 py-2">Message</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Run</th>
                </tr>
              </thead>
              <tbody>
                {runFailures.map((run) => (
                  <tr key={run.id} className="border-b align-top">
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{relativeTime(run.createdAt)}</td>
                    <td className="px-2 py-2">
                      <Link className="underline" href={`/admin/venues/${run.venue.id}`}>
                        {run.venue.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 font-mono text-destructive">{run.errorCode ?? "—"}</td>
                    <td className="max-w-xs px-2 py-2">
                      <span title={run.errorDetail ?? run.errorMessage ?? ""}>
                        {(run.errorMessage ?? "—").slice(0, 80)}
                        {(run.errorMessage ?? "").length > 80 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <Link className="underline" href={`/admin/ingest/runs/${run.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Panel 3 — Candidate Rejections */}
      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Candidate Rejections</h2>
          <DaysFilter
            value={candidateDays}
            onChange={(d) => {
              setCandidateDays(d);
              void fetchCandidateRejections(d);
            }}
          />
          {loadingCandidates ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
        </div>
        {candidateRejections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No candidate rejections in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Venue</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Run</th>
                </tr>
              </thead>
              <tbody>
                {candidateRejections.map((c) => (
                  <tr key={c.id} className="border-b align-top">
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{relativeTime(c.createdAt)}</td>
                    <td className="max-w-[200px] px-2 py-2">
                      <span title={c.title}>
                        {c.title.slice(0, 48)}
                        {c.title.length > 48 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <Link className="underline" href={`/admin/venues/${c.venue.id}`}>
                        {c.venue.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {c.confidenceScore != null ? `${c.confidenceScore}` : "—"}
                      {c.confidenceBand ? ` (${c.confidenceBand})` : ""}
                    </td>
                    <td className="max-w-xs px-2 py-2 text-muted-foreground">
                      <span title={c.rejectionReason ?? ""}>
                        {(c.rejectionReason ?? "—").slice(0, 80)}
                        {(c.rejectionReason ?? "").length > 80 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {c.run ? (
                        <Link className="underline" href={`/admin/ingest/runs/${c.run.id}`}>
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
