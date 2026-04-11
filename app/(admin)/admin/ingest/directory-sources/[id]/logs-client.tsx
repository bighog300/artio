"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type CrawlLogEntry = {
  _type: "crawl";
  _time: string;
  id: string;
  letter: string;
  page: number;
  strategy: string;
  found: number;
  newEntities: number;
  errorMessage: string | null;
  htmlPreview: string | null;
  durationMs: number | null;
  crawledAt: string;
};

type DiscoveryLogEntry = {
  _type: "discovery";
  _time: string;
  id: string;
  entityId: string;
  entityUrl: string;
  entityName: string | null;
  status: string;
  candidateId: string | null;
  errorMessage: string | null;
  model: string | null;
  tokensUsed: number | null;
  confidenceScore: number | null;
  confidenceBand: string | null;
  durationMs: number | null;
  createdAt: string;
};

type LogEntry = CrawlLogEntry | DiscoveryLogEntry;

type CandidateDetail = {
  id: string;
  name: string;
  bio: string | null;
  mediums: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  nationality: string | null;
  birthYear: number | null;
  confidenceScore: number;
  confidenceBand: string;
  confidenceReasons: unknown;
  status: string;
  runs: Array<{
    id: string;
    model: string;
    usageTotalTokens: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    durationMs: number | null;
    attemptedAt: string;
  }>;
};

function statusChip(status: string) {
  if (status === "created") return "bg-emerald-100 text-emerald-800";
  if (status === "linked") return "bg-blue-100 text-blue-800";
  if (status === "skipped") return "bg-muted text-muted-foreground";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}

function confidenceChip(band: string | null) {
  if (band === "HIGH") return "bg-emerald-100 text-emerald-800";
  if (band === "MEDIUM") return "bg-amber-100 text-amber-700";
  return "bg-muted text-muted-foreground";
}

function fmt(ms: number | null) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString();
}

export default function LogsClient({ sourceId }: { sourceId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<"all" | "crawl" | "discovery">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candidateDetail, setCandidateDetail] = useState<Record<string, CandidateDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: filter,
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/ingest/directory-sources/${sourceId}/logs?${params}`);
      if (!res.ok) throw new Error("Failed to load logs");
      const data = await res.json() as { logs: LogEntry[] };
      setLogs(data.logs);
      setPage(nextPage);
    } catch {
      enqueueToast({ title: "Failed to load logs", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [sourceId, filter]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void load(1), 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  async function loadCandidateDetail(candidateId: string) {
    if (candidateDetail[candidateId]) {
      setExpandedId(expandedId === candidateId ? null : candidateId);
      return;
    }
    setLoadingDetail(candidateId);
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${sourceId}/logs/${candidateId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { candidate: CandidateDetail };
      setCandidateDetail((prev) => ({ ...prev, [candidateId]: data.candidate }));
      setExpandedId(candidateId);
    } catch {
      enqueueToast({ title: "Failed to load candidate detail", variant: "error" });
    } finally {
      setLoadingDetail(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border text-sm">
          {(["all", "crawl", "discovery"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`px-3 py-1.5 capitalize ${filter === f ? "bg-foreground text-background" : "hover:bg-muted"}`}
              onClick={() => {
                setFilter(f);
                void load(1);
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(1)}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh (10s)
        </label>
        <span className="text-xs text-muted-foreground">{logs.length} entries</span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Strategy / Model</th>
              <th className="px-3 py-2">Found / Confidence</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={8}>
                  No log entries yet. Run a crawl or queue entities to see logs.
                </td>
              </tr>
            ) : null}
            {logs.map((entry) => (
              <Fragment key={entry.id}>
                <tr
                  className={`border-b last:border-0 ${entry._type === "discovery" && entry.candidateId ? "cursor-pointer hover:bg-muted/30" : ""}`}
                  onClick={() => {
                    if (entry._type === "discovery" && entry.candidateId) {
                      void loadCandidateDetail(entry.candidateId);
                    }
                  }}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">
                    {fmtTime(entry._time)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${entry._type === "crawl" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                      {entry._type}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    {entry._type === "crawl" ? (
                      <span className="font-mono">Letter {entry.letter} / p{entry.page}</span>
                    ) : (
                      <div>
                        <div className="truncate font-medium">{entry.entityName ?? "—"}</div>
                        <div className="max-w-[240px] truncate text-muted-foreground">{entry.entityUrl}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {entry._type === "crawl" ? (
                      entry.errorMessage
                        ? <span className="text-destructive">error</span>
                        : <span className="text-emerald-700">ok</span>
                    ) : (
                      <Badge className={statusChip(entry.status)}>{entry.status}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {entry._type === "crawl" ? entry.strategy : (entry.model ?? "—")}
                  </td>
                  <td className="px-3 py-2">
                    {entry._type === "crawl" ? (
                      <span>{entry.found} found, {entry.newEntities} new</span>
                    ) : entry.confidenceBand ? (
                      <span className={`rounded px-1.5 py-0.5 ${confidenceChip(entry.confidenceBand)}`}>
                        {entry.confidenceBand} ({entry.confidenceScore})
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(entry.durationMs)}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-destructive" title={entry.errorMessage ?? ""}>
                    {entry.errorMessage ?? "—"}
                  </td>
                </tr>

                {entry._type === "discovery" && entry.candidateId && expandedId === entry.candidateId ? (
                  <tr className="border-b bg-muted/20">
                    <td colSpan={8} className="px-4 py-3">
                      {loadingDetail === entry.candidateId ? (
                        <span className="text-xs text-muted-foreground">Loading…</span>
                      ) : candidateDetail[entry.candidateId] ? (
                        <CandidateDetailPanel candidate={candidateDetail[entry.candidateId]} />
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</Button>
        <span className="text-muted-foreground">Page {page}</span>
        <Button type="button" size="sm" variant="outline" disabled={logs.length < PAGE_SIZE} onClick={() => void load(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function CandidateDetailPanel({ candidate }: { candidate: CandidateDetail }) {
  const reasons = Array.isArray(candidate.confidenceReasons) ? candidate.confidenceReasons as string[] : [];
  const latestRun = candidate.runs[0];

  return (
    <div className="grid gap-3 text-xs md:grid-cols-2">
      <div className="space-y-1">
        <div className="text-sm font-medium">{candidate.name}</div>
        {candidate.bio ? <p className="text-muted-foreground">{candidate.bio}</p> : <p className="italic text-muted-foreground">No bio extracted</p>}
        <div className="mt-1 flex flex-wrap gap-1">
          {candidate.mediums.map((m) => (
            <span key={m} className="rounded bg-muted px-1.5 py-0.5">{m}</span>
          ))}
        </div>
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          {candidate.nationality ? <div>Nationality: {candidate.nationality}</div> : null}
          {candidate.birthYear ? <div>Born: {candidate.birthYear}</div> : null}
          {candidate.websiteUrl ? <div>Web: <a href={candidate.websiteUrl} className="underline" target="_blank" rel="noreferrer">{candidate.websiteUrl}</a></div> : null}
          {candidate.instagramUrl ? <div>IG: <a href={candidate.instagramUrl} className="underline" target="_blank" rel="noreferrer">{candidate.instagramUrl}</a></div> : null}
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <div className="mb-1 font-medium">Confidence signals</div>
          <div className="space-y-0.5 text-muted-foreground">
            {reasons.map((r, i) => <div key={i}>• {r}</div>)}
            {reasons.length === 0 ? <div className="italic">No reasons recorded</div> : null}
          </div>
        </div>
        {latestRun ? (
          <div>
            <div className="mb-1 font-medium">Extraction run</div>
            <div className="space-y-0.5 text-muted-foreground">
              <div>Model: {latestRun.model}</div>
              <div>Tokens: {latestRun.usageTotalTokens?.toLocaleString() ?? "—"}</div>
              <div>Duration: {fmt(latestRun.durationMs)}</div>
              {latestRun.errorCode ? <div className="text-destructive">Error: {latestRun.errorCode} — {latestRun.errorMessage}</div> : null}
            </div>
          </div>
        ) : null}
        <div>
          <span className="font-medium">Status: </span>
          <span className="capitalize">{candidate.status}</span>
        </div>
      </div>
    </div>
  );
}
