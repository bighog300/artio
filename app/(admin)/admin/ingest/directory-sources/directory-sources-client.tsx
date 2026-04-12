"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enqueueToast } from "@/lib/toast";

export type DirectorySourcesListResponse = {
  sources: Array<{
    id: string;
    name: string;
    baseUrl: string;
    indexPattern: string;
    linkPattern: string | null;
    entityType: string;
    isActive: boolean;
    crawlIntervalMinutes: number;
    maxPagesPerLetter: number;
    pipelineMode: string;
    lastPipelineRunAt: string | null;
    lastPipelineError: string | null;
    lastRunFound: number | null;
    lastRunStrategy: string | null;
    lastRunError: string | null;
    createdAt: string;
    cursor: {
      currentLetter: string;
      currentPage: number;
      lastRunAt: string | null;
      lastSuccessAt: string | null;
      lastError: string | null;
    } | null;
    _count: { entities: number };
  }>;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  if (abs < 60_000) return future ? "in <1 min" : "just now";
  if (abs < 3_600_000) return `${future ? "in " : ""}${Math.round(abs / 60_000)} min${future ? "" : " ago"}`;
  if (abs < 86_400_000) return `${future ? "in " : ""}${Math.round(abs / 3_600_000)} hr${future ? "" : " ago"}`;
  return `${future ? "in " : ""}${Math.round(abs / 86_400_000)} day${future ? "" : " ago"}`;
}

const INTERVAL_OPTIONS = [
  { label: "Daily", value: 1440 },
  { label: "Weekly", value: 10080 },
  { label: "Monthly", value: 43200 },
] as const;

export default function DirectorySourcesClient({ initial }: { initial: DirectorySourcesListResponse }) {
  const [sources, setSources] = useState(initial.sources);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningById, setRunningById] = useState<Record<string, boolean>>({});
  const [pipelineResultById, setPipelineResultById] = useState<Record<string, string>>({});
  const [pipeliningById, setPipeliningById] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://www.saatchiart.com");
  const [indexPattern, setIndexPattern] = useState("https://www.saatchiart.com/artists/[letter]/[page]");
  const [linkPattern, setLinkPattern] = useState("");
  const [entityType, setEntityType] = useState<"ARTIST" | "VENUE">("ARTIST");
  const [crawlIntervalMinutes, setCrawlIntervalMinutes] = useState("10080");
  const [maxPagesPerLetter, setMaxPagesPerLetter] = useState("5");
  const [pipelineMode, setPipelineMode] = useState<"manual" | "auto_discover" | "auto_full">("manual");

  async function createSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ingest/directory-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          baseUrl,
          indexPattern,
          linkPattern: linkPattern || null,
          entityType,
          crawlIntervalMinutes: Number.parseInt(crawlIntervalMinutes, 10),
          maxPagesPerLetter: Number.parseInt(maxPagesPerLetter, 10),
          pipelineMode,
        }),
      });
      if (!res.ok) throw new Error("Failed to create directory source");
      enqueueToast({ title: "Directory source created", variant: "success" });
      window.location.reload();
    } catch {
      enqueueToast({ title: "Failed to create source", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function runNow(id: string) {
    setRunningById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to run crawl");
      await res.json() as { letter: string; page: number; found: number; newEntities: number };
      enqueueToast({ title: "Directory crawl run complete", variant: "success" });
      window.location.reload();
    } catch {
      enqueueToast({ title: "Failed to run crawl", variant: "error" });
    } finally {
      setRunningById((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function runPipeline(id: string, sourcePipelineMode: string) {
    setPipeliningById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineMode: sourcePipelineMode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? "Failed to run pipeline");
      }
      const data = await res.json() as {
        letter: string;
        entitiesCrawled: number;
        artistsDiscovered: number;
        artworksExtracted: number;
        errors: string[];
      };
      setPipelineResultById((prev) => ({
        ...prev,
        [id]: `${data.letter}: ${data.entitiesCrawled} crawled, ${data.artistsDiscovered} artists, ${data.artworksExtracted} artworks`,
      }));
      enqueueToast({ title: "Pipeline run complete", variant: "success" });
    } catch (error) {
      enqueueToast({
        title: error instanceof Error ? error.message : "Pipeline failed",
        variant: "error",
      });
    } finally {
      setPipeliningById((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error("Failed to update source");
      setSources((prev) => prev.map((source) => source.id === id ? { ...source, isActive: !isActive } : source));
    } catch {
      enqueueToast({ title: "Failed to update source", variant: "error" });
    }
  }

  async function deleteSource(id: string) {
    if (!window.confirm("Delete this directory source and all entities?")) return;
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete source");
      setSources((prev) => prev.filter((source) => source.id !== id));
    } catch {
      enqueueToast({ title: "Failed to delete source", variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background p-4">
        {!formOpen ? (
          <Button type="button" onClick={() => setFormOpen(true)}>Add source</Button>
        ) : (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createSource}>
            <label className="space-y-1 text-sm">
              <span>Name</span>
              <input className="w-full rounded-md border bg-background px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="space-y-1 text-sm">
              <span>Base URL</span>
              <input className="w-full rounded-md border bg-background px-3 py-2" placeholder="https://www.saatchiart.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Index pattern</span>
              <input className="w-full rounded-md border bg-background px-3 py-2" placeholder="https://www.saatchiart.com/artists/[letter]/[page]" value={indexPattern} onChange={(e) => setIndexPattern(e.target.value)} required />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>
                Link pattern{" "}
                <span className="text-muted-foreground">
                  (optional regex to identify profile URLs, e.g. <code>/artists/[^/]+</code>)
                </span>
              </span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                placeholder="/artists/[^/]+/?$"
                value={linkPattern}
                onChange={(e) => setLinkPattern(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Entity type</span>
              <select className="w-full rounded-md border bg-background px-3 py-2" value={entityType} onChange={(e) => setEntityType(e.target.value as "ARTIST" | "VENUE")}>
                <option value="ARTIST">Artist</option>
                <option value="VENUE">Venue</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Crawl interval</span>
              <select className="w-full rounded-md border bg-background px-3 py-2" value={crawlIntervalMinutes} onChange={(e) => setCrawlIntervalMinutes(e.target.value)}>
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Pipeline mode</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2"
                value={pipelineMode}
                onChange={(e) => setPipelineMode(e.target.value as "manual" | "auto_discover" | "auto_full")}
              >
                <option value="manual">Manual — admin controls each step</option>
                <option value="auto_discover">Auto discover — crawl + queue automatically</option>
                <option value="auto_full">Auto full — crawl + discover + extract artworks</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Max pages per letter</span>
              <input className="w-full rounded-md border bg-background px-3 py-2" type="number" min={1} max={50} value={maxPagesPerLetter} onChange={(e) => setMaxPagesPerLetter(e.target.value)} />
            </label>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add directory source"}</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-lg border bg-background p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Entity type</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pipeline mode</TableHead>
              <TableHead>Cursor position</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Entities found</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell>{source.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{source.entityType}</Badge>
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{source.indexPattern}</TableCell>
                <TableCell>
                  <button type="button" className={`rounded px-2 py-0.5 text-xs ${source.isActive ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`} onClick={() => toggleActive(source.id, source.isActive)}>
                    {source.isActive ? "Active" : "Inactive"}
                  </button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{source.pipelineMode}</div>
                  <div>{relativeTime(source.lastPipelineRunAt)}</div>
                </TableCell>
                <TableCell className="text-sm">{source.cursor ? `${source.cursor.currentLetter} / p${source.cursor.currentPage}` : "Not started"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{relativeTime(source.cursor?.lastRunAt ?? null)}</TableCell>
                <TableCell>
                  {source.lastRunError ? (
                    <span className="block max-w-[200px] truncate text-xs text-destructive" title={source.lastRunError}>
                      ⚠ {source.lastRunError.slice(0, 60)}
                    </span>
                  ) : source.lastRunFound != null ? (
                    <span className="text-xs text-muted-foreground">
                      {source.lastRunFound} found
                      {source.lastRunStrategy ? ` · ${source.lastRunStrategy}` : ""}
                    </span>
                  ) : null}
                  {source.lastPipelineError ? (
                    <span className="block max-w-[200px] truncate text-xs text-destructive" title={source.lastPipelineError}>
                      ⚠ {source.lastPipelineError.slice(0, 60)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={runningById[source.id]} onClick={() => runNow(source.id)}>
                      {runningById[source.id] ? "Running…" : "Run now"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pipeliningById[source.id]}
                      onClick={() => runPipeline(source.id, source.pipelineMode)}
                    >
                      {pipeliningById[source.id] ? "Running…" : "Run pipeline"}
                    </Button>
                    <Link href={`/admin/ingest/directory-sources/${source.id}`} className="text-sm underline">View entities</Link>
                    <Button type="button" size="sm" variant="outline" onClick={() => deleteSource(source.id)}>Delete</Button>
                    <span className="text-xs text-muted-foreground">{source._count.entities} total entities</span>
                    {pipelineResultById[source.id] ? (
                      <span className="text-xs text-muted-foreground">{pipelineResultById[source.id]}</span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
