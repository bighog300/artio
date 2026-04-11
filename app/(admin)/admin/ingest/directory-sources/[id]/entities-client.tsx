"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enqueueToast } from "@/lib/toast";

export type DirectorySourceDetail = {
  id: string;
  name: string;
  baseUrl: string;
  entityType: string;
  crawlIntervalMinutes: number;
  linkPattern: string | null;
  cursor: {
    currentLetter: string;
    currentPage: number;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  } | null;
};

export type DirectoryEntitiesResponse = {
  entities: Array<{
    id: string;
    entityUrl: string;
    entityName: string | null;
    matchedArtistId: string | null;
    lastSeenAt: string;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type RunRecord = {
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

export default function EntitiesClient({ source, initial }: { source: DirectorySourceDetail; initial: DirectoryEntitiesResponse }) {
  const [payload, setPayload] = useState(initial);
  const [page, setPage] = useState(initial.page);
  const [unmatched, setUnmatched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const [queuingById, setQueuingById] = useState<Record<string, boolean>>({});
  const [editingPattern, setEditingPattern] = useState(false);
  const [linkPattern, setLinkPattern] = useState(source.linkPattern ?? "");

  async function load(nextPage: number, unmatchedOnly: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(payload.pageSize) });
      if (unmatchedOnly) params.set("unmatched", "true");
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/entities?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load entities");
      const data = await res.json() as DirectoryEntitiesResponse;
      setPayload(data);
      setPage(data.page);
    } catch {
      enqueueToast({ title: "Failed to load entities", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to run crawl");
      await res.json() as { letter: string; page: number; found: number; newEntities: number };
      enqueueToast({ title: "Directory crawl run complete", variant: "success" });
      window.location.reload();
    } catch {
      enqueueToast({ title: "Failed to run crawl", variant: "error" });
    } finally {
      setRunning(false);
    }
  }

  async function loadRuns() {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/runs`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { runs: RunRecord[] };
      setRuns(data.runs);
      setShowRuns(true);
    } catch {
      enqueueToast({ title: "Failed to load run history", variant: "error" });
    } finally {
      setRunsLoading(false);
    }
  }

  async function runAll() {
    if (!window.confirm("Run all 26 letters? This may take several minutes.")) return;
    setRunningAll(true);
    setRunAllProgress("Starting A–Z crawl…");

    try {
      let done = false;
      let totalFound = 0;

      while (!done) {
        const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/run`, { method: "POST" });
        if (!res.ok) throw new Error("Run failed");
        const data = await res.json() as { letter: string; found: number; newEntities: number; done: boolean };
        totalFound += data.found;
        done = data.done;
        setRunAllProgress(`Crawled ${data.letter}: ${data.found} found (${totalFound} total)…`);
        if (!done) await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setRunAllProgress(`Complete — ${totalFound} entities found across A–Z`);
      enqueueToast({ title: "A–Z crawl complete", variant: "success" });
      void load(1, unmatched);
      void loadRuns();
    } catch {
      enqueueToast({ title: "A–Z crawl failed", variant: "error" });
      setRunAllProgress(null);
    } finally {
      setRunningAll(false);
    }
  }

  async function queueAllUnmatched() {
    if (!window.confirm("Queue all unmatched entities with valid names for discovery? This calls the AI for each one.")) return;
    setQueueingAll(true);

    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/entities?unmatched=true&pageSize=200`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as DirectoryEntitiesResponse;
      const eligible = data.entities.filter((entity) => !entity.matchedArtistId && entity.entityName && entity.entityName.trim().length >= 3);

      let succeeded = 0;
      let failed = 0;

      for (const entity of eligible) {
        try {
          const queuedRes = await fetch(`/api/admin/ingest/directory-sources/${source.id}/entities/${entity.id}/queue`, { method: "POST" });
          if (queuedRes.ok) succeeded += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      enqueueToast({
        title: `Queued ${succeeded} artists${failed > 0 ? `, ${failed} failed` : ""}`,
        variant: succeeded > 0 ? "success" : "error",
      });
      void load(1, unmatched);
    } catch {
      enqueueToast({ title: "Failed to queue all", variant: "error" });
    } finally {
      setQueueingAll(false);
    }
  }

  async function queue(entityId: string) {
    setQueuingById((prev) => ({ ...prev, [entityId]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/entities/${entityId}/queue`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to queue entity");
      const data = await res.json() as { status: string; candidateId: string | null };
      enqueueToast({
        title: data.status === "created"
          ? "Artist candidate created"
          : data.status === "linked"
            ? "Linked to existing candidate"
            : "Already exists — skipped",
        variant: "success",
      });
    } catch {
      enqueueToast({ title: "Failed to queue entity", variant: "error" });
    } finally {
      setQueuingById((prev) => ({ ...prev, [entityId]: false }));
    }
  }

  async function savePattern() {
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkPattern: linkPattern.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      enqueueToast({ title: "Link pattern saved", variant: "success" });
      setEditingPattern(false);
      window.location.reload();
    } catch {
      enqueueToast({ title: "Failed to save pattern", variant: "error" });
    }
  }

  async function clearInvalid() {
    if (!window.confirm("Delete all invalid entities (no name or letter-index URLs) and reset cursor to A?")) return;
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${source.id}/entities`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear");
      const data = await res.json() as { deleted: number };
      enqueueToast({ title: `Cleared ${data.deleted} invalid entities`, variant: "success" });
      void load(1, unmatched);
    } catch {
      enqueueToast({ title: "Failed to clear invalid entities", variant: "error" });
    }
  }

  const totalPages = Math.max(1, Math.ceil(payload.total / payload.pageSize));

  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => void runNow()}>
          {running ? "Running…" : "Run now"}
        </Button>
        <Button type="button" variant="outline" disabled={runningAll || running} onClick={() => void runAll()}>
          {runningAll ? "Running A–Z…" : "Run full A–Z"}
        </Button>
        <Button type="button" variant="outline" disabled={queueingAll} onClick={() => void queueAllUnmatched()}>
          {queueingAll ? "Queueing…" : "Queue all unmatched"}
        </Button>
        <Button
          type="button"
          variant={unmatched ? "default" : "outline"}
          onClick={() => {
            const next = !unmatched;
            setUnmatched(next);
            void load(1, next);
          }}
        >
          Show unmatched only
        </Button>
        <Button type="button" variant="outline" onClick={() => void clearInvalid()}>
          Clear invalid entities
        </Button>
        {runAllProgress ? (
          <span className="text-xs text-muted-foreground">{runAllProgress}</span>
        ) : null}
        <span className="text-sm text-muted-foreground">{payload.total} entities</span>
      </div>

      {editingPattern ? (
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-md border bg-background px-3 py-1 font-mono text-sm"
            placeholder="/artists/[^/]+/?$"
            value={linkPattern}
            onChange={(e) => setLinkPattern(e.target.value)}
          />
          <Button type="button" size="sm" onClick={() => void savePattern()}>Save</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditingPattern(false)}>Cancel</Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditingPattern(true)}>
          {source.linkPattern ? `Pattern: ${source.linkPattern}` : "Set link pattern"}
        </Button>
      )}

      {showRuns ? (
        <section className="space-y-2 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">A–Z crawl progress</h3>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowRuns(false)}>Hide</Button>
          </div>

          <div className="flex flex-wrap gap-1">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => {
              const latest = runs.find((run) => run.letter === letter);
              const hasError = latest?.errorMessage != null;
              const hasResults = (latest?.found ?? 0) > 0;
              const notRun = !latest;
              return (
                <div
                  key={letter}
                  title={latest
                    ? `${latest.found} found, ${latest.newEntities} new, strategy: ${latest.strategy}${latest.errorMessage ? `\nError: ${latest.errorMessage}` : ""}`
                    : "Not yet crawled"}
                  className={`flex h-8 w-8 items-center justify-center rounded text-xs font-mono font-medium ${
                    notRun ? "bg-muted text-muted-foreground"
                      : hasError && !hasResults ? "bg-destructive/15 text-destructive"
                        : hasResults ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {letter}
                </div>
              );
            })}
          </div>

          <div className="max-h-64 overflow-y-auto rounded border">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1.5">Letter</th>
                  <th className="px-2 py-1.5">Strategy</th>
                  <th className="px-2 py-1.5">Found</th>
                  <th className="px-2 py-1.5">New</th>
                  <th className="px-2 py-1.5">Duration</th>
                  <th className="px-2 py-1.5">Time</th>
                  <th className="px-2 py-1.5">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-mono">{run.letter}</td>
                    <td className="px-2 py-1.5">{run.strategy}</td>
                    <td className={`px-2 py-1.5 ${run.found === 0 ? "text-muted-foreground" : "text-emerald-700"}`}>{run.found}</td>
                    <td className="px-2 py-1.5">{run.newEntities}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{new Date(run.crawledAt).toLocaleTimeString()}</td>
                    <td className="max-w-[200px] truncate px-2 py-1.5 text-xs text-destructive">{run.errorMessage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {runs.find((run) => run.found === 0 && run.htmlPreview) ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">HTML preview from last zero-result fetch</summary>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                {runs.find((run) => run.found === 0 && run.htmlPreview)?.htmlPreview}
              </pre>
            </details>
          ) : null}
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => void loadRuns()} disabled={runsLoading}>
          {runsLoading ? "Loading…" : "Show run history"}
        </Button>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Matched artist</TableHead>
            <TableHead>First seen</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payload.entities.map((entity) => (
            <TableRow key={entity.id}>
              <TableCell>{entity.entityName ?? "—"}</TableCell>
              <TableCell>
                <a className="max-w-[340px] block truncate underline" href={entity.entityUrl} target="_blank" rel="noreferrer">
                  {entity.entityUrl}
                </a>
              </TableCell>
              <TableCell>
                {entity.matchedArtistId ? (
                  <Link className="underline" href={`/admin/artists/${entity.matchedArtistId}`}>
                    {entity.matchedArtistId}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unmatched</span>
                )}
              </TableCell>
              <TableCell>{new Date(entity.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                {!entity.matchedArtistId && entity.entityName && entity.entityName.trim().length >= 3 ? (
                  <Button type="button" size="sm" variant="outline" disabled={queuingById[entity.id]} onClick={() => queue(entity.id)}>
                    {queuingById[entity.id] ? "Queueing…" : "Queue for discovery"}
                  </Button>
                ) : !entity.matchedArtistId ? (
                  <span className="text-xs text-muted-foreground">
                    {entity.entityName ? "Invalid name" : "No name"}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm">
        <span>Page {page} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => void load(page - 1, unmatched)}>Previous</Button>
          <Button type="button" variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => void load(page + 1, unmatched)}>Next</Button>
        </div>
      </div>
    </section>
  );
}
