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

export default function EntitiesClient({ source, initial }: { source: DirectorySourceDetail; initial: DirectoryEntitiesResponse }) {
  const [payload, setPayload] = useState(initial);
  const [page, setPage] = useState(initial.page);
  const [unmatched, setUnmatched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
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
