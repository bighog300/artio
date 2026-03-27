"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enqueueToast } from "@/lib/toast";

export type DiscoveryListResponse = {
  jobs: Array<{
    id: string;
    entityType: "VENUE" | "ARTIST" | "EVENT";
    queryTemplate: string;
    region: string;
    searchProvider: string;
    maxResults: number;
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    resultsCount: number | null;
    errorMessage: string | null;
    createdAt: string;
    _count: { candidates: number };
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type Candidate = {
  id: string;
  url: string;
  title: string | null;
  status: "PENDING" | "QUEUED" | "DONE" | "SKIPPED";
  skipReason: string | null;
};

const DEFAULT_TEMPLATES: Record<"VENUE" | "ARTIST" | "EVENT", string> = {
  VENUE: "[region] contemporary art gallery exhibition 2026",
  ARTIST: "[region] contemporary visual artist painter sculptor",
  EVENT: "[region] art exhibition opening event 2026",
};

function statusClassName(status: string): string {
  if (status === "RUNNING") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  if (status === "DONE") return "bg-green-100 text-green-800 hover:bg-green-100";
  if (status === "FAILED") return "bg-red-100 text-red-800 hover:bg-red-100";
  return "bg-muted text-muted-foreground hover:bg-muted";
}

function parseSearchErrorHint(
  msg: string | null,
): string | null {
  if (!msg) return null;
  if (
    msg.includes("accessNotConfigured") ||
    msg.includes("API has not been used")
  )
    return "Enable Custom Search API in Google Cloud";
  if (
    msg.includes("keyInvalid") ||
    msg.includes("API key not valid")
  )
    return "Invalid API key — check Settings";
  if (msg.includes("quota") || msg.includes("429"))
    return "Daily quota exceeded (100/day free tier)";
  if (msg.includes("403"))
    return "Permission denied — check API key & CX";
  if (msg.includes("400"))
    return "Bad request — verify CX in Settings";
  if (
    msg.includes("not set") ||
    msg.includes("not configured")
  )
    return "Keys not saved — check Settings";
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed")
  )
    return "Network error — outbound fetch blocked";
  return null;
}

export default function DiscoveryClient({ initial }: { initial: DiscoveryListResponse }) {
  const [jobs, setJobs] = useState(initial.jobs);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    provider: string;
    durationMs: number;
    resultsCount?: number;
    results?: Array<{ url: string; title: string }>;
    errorMessage?: string;
    suggestion?: string | null;
    keysConfigured?: {
      googlePseApiKey: boolean;
      googlePseCx: boolean;
      braveSearchApiKey: boolean;
    };
  } | null>(null);
  const [entityType, setEntityType] = useState<"VENUE" | "ARTIST" | "EVENT">("VENUE");
  const [queryTemplate, setQueryTemplate] = useState(DEFAULT_TEMPLATES.VENUE);
  const [region, setRegion] = useState("");
  const [searchProvider, setSearchProvider] = useState<"google_pse" | "brave">("google_pse");
  const [maxResults, setMaxResults] = useState("10");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [candidateCache, setCandidateCache] = useState<Record<string, Candidate[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [queuingById, setQueuingById] = useState<Record<string, boolean>>({});
  const [queueResultById, setQueueResultById] = useState<Record<string, "queued" | "error" | "already_queued" | "no_venue">>({});
  const [seedingById, setSeedingById] = useState<Record<string, boolean>>({});
  const [seedResultById, setSeedResultById] = useState<Record<string,
    | { ok: true; venueId: string; venueName: string; venueCreated: boolean }
    | { ok: false; error: string }
  >>({});

  function handleEntityTypeChange(next: "VENUE" | "ARTIST" | "EVENT") {
    setEntityType(next);
    setQueryTemplate((prev) => {
      const currentDefault = DEFAULT_TEMPLATES[entityType];
      if (prev === currentDefault) {
        return DEFAULT_TEMPLATES[next];
      }
      return prev;
    });
  }

  async function refreshJobs() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/ingest/discovery");
      if (!res.ok) return;
      const data = await res.json() as DiscoveryListResponse;
      setJobs(data.jobs);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }

  async function createJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ingest/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          queryTemplate,
          region,
          searchProvider,
          maxResults: Number.parseInt(maxResults, 10),
        }),
      });

      if (!res.ok) throw new Error("Failed to create discovery job");
      const data = await res.json() as { jobId: string };
      setJobs((prev) => [{
        id: data.jobId,
        entityType,
        queryTemplate,
        region,
        searchProvider,
        maxResults: Number.parseInt(maxResults, 10),
        status: "PENDING",
        resultsCount: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        _count: { candidates: 0 },
      }, ...prev]);
    } catch {
      enqueueToast({ title: "Failed to run discovery job", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }


  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const params = new URLSearchParams({
        provider: searchProvider,
        query: queryTemplate.trim() || "contemporary art gallery",
        maxResults: "3",
      });
      const res = await fetch(`/api/admin/ingest/search-test?${params}`);
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({
        ok: false,
        provider: searchProvider,
        durationMs: 0,
        errorMessage: "Network error — could not reach the test endpoint",
        suggestion: null,
      });
    } finally {
      setTesting(false);
    }
  }

  async function toggleCandidates(jobId: string) {
    setExpanded((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
    if (candidateCache[jobId]) return;
    const res = await fetch(`/api/admin/ingest/discovery/${jobId}/candidates`);
    if (!res.ok) {
      enqueueToast({ title: "Failed to load candidates", variant: "error" });
      return;
    }
    const data = await res.json() as { candidates: Candidate[] };
    setCandidateCache((prev) => ({ ...prev, [jobId]: data.candidates }));
  }

  async function queueCandidate(jobId: string, candidateId: string) {
    setQueuingById((prev) => ({
      ...prev,
      [candidateId]: true,
    }));
    try {
      const res = await fetch(
        `/api/admin/ingest/discovery/${jobId}/candidates/${candidateId}/queue`,
        { method: "POST" },
      );

      if (res.ok) {
        setQueueResultById((prev) => ({
          ...prev,
          [candidateId]: "queued",
        }));
        setCandidateCache((prev) => ({
          ...prev,
          [jobId]: (prev[jobId] ?? []).map((c) => (
            c.id === candidateId
              ? { ...c, status: "QUEUED" as const }
              : c
          )),
        }));
        return;
      }

      const body = await res.json().catch(() => ({})) as { error?: string };
      if (res.status === 409 || body.error === "already_queued") {
        setQueueResultById((prev) => ({
          ...prev,
          [candidateId]: "already_queued",
        }));
      } else if (body.error === "venue_not_found") {
        setQueueResultById((prev) => ({
          ...prev,
          [candidateId]: "no_venue",
        }));
      } else {
        setQueueResultById((prev) => ({
          ...prev,
          [candidateId]: "error",
        }));
      }
    } catch {
      setQueueResultById((prev) => ({
        ...prev,
        [candidateId]: "error",
      }));
    } finally {
      setQueuingById((prev) => ({
        ...prev,
        [candidateId]: false,
      }));
    }
  }


  async function seedVenue(jobId: string, candidateId: string) {
    setSeedingById((prev) => ({ ...prev, [candidateId]: true }));
    try {
      const res = await fetch(
        `/api/admin/ingest/discovery/${jobId}/candidates/${candidateId}/seed-venue`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({})) as {
        venueId?: string;
        venueName?: string;
        venueCreated?: boolean;
        error?: string;
      };

      if (res.ok) {
        setSeedResultById((prev) => ({
          ...prev,
          [candidateId]: {
            ok: true,
            venueId: body.venueId ?? "",
            venueName: body.venueName ?? "Venue",
            venueCreated: body.venueCreated ?? false,
          },
        }));
        setCandidateCache((prev) => ({
          ...prev,
          [jobId]: (prev[jobId] ?? []).map((c) => (
            c.id === candidateId
              ? { ...c, status: "QUEUED" as const }
              : c
          )),
        }));
      } else {
        setSeedResultById((prev) => ({
          ...prev,
          [candidateId]: {
            ok: false,
            error: body.error ?? "Failed",
          },
        }));
      }
    } catch {
      setSeedResultById((prev) => ({
        ...prev,
        [candidateId]: { ok: false, error: "Network error" },
      }));
    } finally {
      setSeedingById((prev) => ({ ...prev, [candidateId]: false }));
    }
  }

  function renderCandidateRows(job: DiscoveryListResponse["jobs"][number], candidates: Candidate[]) {
    const pendingCount = candidates.filter((candidate) => candidate.status === "PENDING").length;
    return (
      <div>
        {job.entityType === "VENUE" && pendingCount > 0 ? (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {pendingCount} URL{pendingCount === 1 ? "" : "s"} pending
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const pending = (candidateCache[job.id] ?? []).filter((c) => c.status === "PENDING");
                void Promise.allSettled(pending.map((candidate) => seedVenue(job.id, candidate.id)));
              }}
            >
              Seed all PENDING
            </Button>
          </div>
        ) : null}
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Skip reason</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell className="max-w-[420px] truncate"><Link className="underline" href={candidate.url} target="_blank">{candidate.url}</Link></TableCell>
              <TableCell>{candidate.title ?? "—"}</TableCell>
              <TableCell><Badge className={statusClassName(candidate.status)}>{candidate.status}</Badge></TableCell>
              <TableCell>{candidate.skipReason ?? "—"}</TableCell>
              <TableCell>
                {job.entityType === "VENUE" && candidate.status === "PENDING" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={seedingById[candidate.id]}
                        onClick={() => void seedVenue(job.id, candidate.id)}
                      >
                        {seedingById[candidate.id] ? "Seeding…" : "Seed venue"}
                      </Button>
                      <span className="text-xs text-muted-foreground">or</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={queuingById[candidate.id]}
                        onClick={() => void queueCandidate(job.id, candidate.id)}
                      >
                        {queuingById[candidate.id] ? "Queuing…" : "Queue for ingest"}
                      </Button>
                    </div>
                    {(() => {
                      const seedResult = seedResultById[candidate.id];
                      if (!seedResult) return null;
                      if (seedResult.ok) {
                        return seedResult.venueCreated ? (
                          <span className="text-xs text-emerald-700">
                            ✓ Venue created and queued for ingest{" "}
                            <Link href={`/admin/venues/${seedResult.venueId}`} className="underline">
                              view venue
                            </Link>
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-700">✓ Venue already existed — queued for ingest</span>
                        );
                      }
                      return (
                        <span className="text-xs text-destructive">
                          Failed: {seedResult.error}{" "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => void seedVenue(job.id, candidate.id)}
                          >
                            Try again
                          </button>
                        </span>
                      );
                    })()}
                    {queueResultById[candidate.id] === "queued" ? (
                      <span className="text-xs text-emerald-700">✓ Queued</span>
                    ) : queueResultById[candidate.id] === "already_queued" ? (
                      <span className="text-xs text-muted-foreground">Already queued</span>
                    ) : queueResultById[candidate.id] === "no_venue" ? (
                      <span className="text-xs text-amber-700">
                        No venue found —{" "}
                        <Link href="/admin/ingest/venue-generation" className="underline">
                          generate venue first
                        </Link>
                      </span>
                    ) : queueResultById[candidate.id] === "error" ? (
                      <span className="text-xs text-destructive">Failed — try again</span>
                    ) : null}
                  </div>
                ) : candidate.status === "QUEUED" ? (
                  <span className="text-xs text-emerald-700">✓ Queued</span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createJob}>
          <label className="space-y-1 text-sm">
            <span>Entity type</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={entityType} onChange={(e) =>
                handleEntityTypeChange(e.target.value as "VENUE" | "ARTIST" | "EVENT")
              }> 
              <option value="VENUE">Venue</option>
              <option value="ARTIST">Artist</option>
              <option value="EVENT">Event</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Search provider</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={searchProvider} onChange={(e) => {
                setSearchProvider(e.target.value as "google_pse" | "brave");
                setTestResult(null);
              }}> 
              <option value="google_pse">Google PSE</option>
              <option value="brave">Brave Search</option>
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Query template</span>
            <input className="w-full rounded-md border bg-background px-3 py-2" value={queryTemplate} placeholder="[region] contemporary art gallery exhibition 2026" onChange={(e) => setQueryTemplate(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Region</span>
            <input className="w-full rounded-md border bg-background px-3 py-2" value={region} placeholder="e.g. London, UK" onChange={(e) => setRegion(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Max results</span>
            <input min={1} max={50} type="number" className="w-full rounded-md border bg-background px-3 py-2" value={maxResults} onChange={(e) => setMaxResults(e.target.value)} />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>{submitting ? "Running…" : "Run discovery job"}</Button>
            <button
              type="button"
              disabled={testing}
              onClick={() => void testConnection()}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>
          {entityType === "VENUE" ? (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Discovery finds venue URLs. Use <strong className="font-medium">Seed venue</strong> on any candidate to create the
              venue record and queue it for event scraping in one step. Or{" "}
              <Link href="/admin/ingest/venue-generation" className="underline hover:text-foreground">
                generate venues from a region
              </Link>{" "}
              first, then queue the candidates.
            </p>
          ) : null}
        </form>
        {testResult !== null ? (
          <div className={`mt-3 rounded-md border p-3 text-sm ${testResult.ok
            ? "border-emerald-200 bg-emerald-50"
            : "border-rose-200 bg-rose-50"
            }`}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`font-medium ${testResult.ok
                ? "text-emerald-800"
                : "text-rose-800"
                }`}>
                {testResult.ok ? "✓ Connection successful" : "✗ Connection failed"}
              </span>
              <span className="text-xs text-muted-foreground">
                {testResult.provider} · {testResult.durationMs}ms
              </span>
            </div>

            {testResult.ok ? (
              <div className="space-y-1">
                <p className="text-xs text-emerald-700">
                  {testResult.resultsCount} result(s) returned
                </p>
                {(testResult.results ?? []).map((r, i) => (
                  <p key={i} className="truncate text-xs text-muted-foreground">
                    <span className="font-medium">{r.title || "—"}</span>{" "}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all underline">
                      {r.url}
                    </a>
                  </p>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-mono text-rose-800">{testResult.errorMessage}</p>
                {testResult.suggestion ? (
                  <p className="text-xs text-rose-700">→ {testResult.suggestion}</p>
                ) : null}
                {testResult.keysConfigured ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keys saved:{" "}
                    PSE key {testResult.keysConfigured.googlePseApiKey ? "✓" : "✗"}{" · "}
                    CX {testResult.keysConfigured.googlePseCx ? "✓" : "✗"}{" · "}
                    Brave {testResult.keysConfigured.braveSearchApiKey ? "✓" : "✗"}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Recent discovery jobs</p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline hover:text-foreground disabled:opacity-50"
            disabled={refreshing}
            onClick={() => void refreshJobs()}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Entity type</TableHead>
              <TableHead>Query</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Results count</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <Fragment key={job.id}>
                <TableRow>
                  <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{job.entityType}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{job.queryTemplate}</TableCell>
                  <TableCell>{job.region || "—"}</TableCell>
                  <TableCell>{job.searchProvider}</TableCell>
                  <TableCell><Badge className={statusClassName(job.status)}>{job.status}</Badge></TableCell>
                  <TableCell>{job.resultsCount ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px]">
                    {job.errorMessage ? (
                      <div className="space-y-0.5">
                        <p
                          className="truncate text-xs
            text-rose-700 font-mono"
                          title={job.errorMessage}
                        >
                          {job.errorMessage}
                        </p>
                        {parseSearchErrorHint(job.errorMessage)
                          ? (
                            <p className="text-xs
            text-muted-foreground">
                              → {parseSearchErrorHint(
                                job.errorMessage)}
                            </p>
                          ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="outline" size="sm" onClick={() => toggleCandidates(job.id)}>View candidates</Button>
                  </TableCell>
                </TableRow>
                {expanded[job.id] ? (
                  <TableRow key={`${job.id}-panel`}>
                    <TableCell colSpan={9}>
                      {renderCandidateRows(job, candidateCache[job.id] ?? [])}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">No discovery jobs yet.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
