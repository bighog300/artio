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

export default function DiscoveryClient({ initial }: { initial: DiscoveryListResponse }) {
  const [jobs, setJobs] = useState(initial.jobs);
  const [submitting, setSubmitting] = useState(false);
  const [entityType, setEntityType] = useState<"VENUE" | "ARTIST" | "EVENT">("VENUE");
  const [queryTemplate, setQueryTemplate] = useState(DEFAULT_TEMPLATES.VENUE);
  const [region, setRegion] = useState("");
  const [searchProvider, setSearchProvider] = useState<"google_pse" | "brave">("google_pse");
  const [maxResults, setMaxResults] = useState("10");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [candidateCache, setCandidateCache] = useState<Record<string, Candidate[]>>({});
  const [refreshing, setRefreshing] = useState(false);

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
            <select className="w-full rounded-md border bg-background px-3 py-2" value={searchProvider} onChange={(e) => setSearchProvider(e.target.value as "google_pse" | "brave")}> 
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
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>{submitting ? "Running…" : "Run discovery job"}</Button>
          </div>
        </form>
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
                  <TableCell>
                    <Button type="button" variant="outline" size="sm" onClick={() => toggleCandidates(job.id)}>View candidates</Button>
                  </TableCell>
                </TableRow>
                {expanded[job.id] ? (
                  <TableRow key={`${job.id}-panel`}>
                    <TableCell colSpan={8}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>URL</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Skip reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(candidateCache[job.id] ?? []).map((candidate) => (
                            <TableRow key={candidate.id}>
                              <TableCell className="max-w-[420px] truncate"><Link className="underline" href={candidate.url} target="_blank">{candidate.url}</Link></TableCell>
                              <TableCell>{candidate.title ?? "—"}</TableCell>
                              <TableCell><Badge className={statusClassName(candidate.status)}>{candidate.status}</Badge></TableCell>
                              <TableCell>{candidate.skipReason ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">No discovery jobs yet.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
