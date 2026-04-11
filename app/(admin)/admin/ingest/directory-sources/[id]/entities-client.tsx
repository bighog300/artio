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
  const [queuingById, setQueuingById] = useState<Record<string, boolean>>({});

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
