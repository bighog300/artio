"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ArtworkListItem = {
  id: string;
  title: string;
  slug: string | null;
  artistId: string;
  isPublished: boolean;
  updatedAt: string;
  deletedAt: string | null;
  artist?: { name: string };
};

const PAGE_SIZE = 20;

export default function AdminArtworkListClient() {
  const [items, setItems] = useState<ArtworkListItem[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [onlyArchived, setOnlyArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPage = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query.trim()) params.set("query", query.trim());
      if (showArchived) params.set("showArchived", "1");
      if (onlyArchived) params.set("onlyArchived", "1");
      const res = await fetch(`/api/admin/artwork?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load artworks");
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artworks");
    } finally {
      setBusy(false);
    }
  }, [onlyArchived, page, query, showArchived]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Artwork</h2>
        <p className="text-sm text-muted-foreground">Total: {total}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          className="rounded border px-2 py-1 text-sm"
          placeholder="Search artwork"
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => {
              setPage(1);
              setShowArchived(event.target.checked);
              if (!event.target.checked) setOnlyArchived(false);
            }}
          />
          Show archived
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyArchived}
            onChange={(event) => {
              setPage(1);
              setOnlyArchived(event.target.checked);
              if (event.target.checked) setShowArchived(true);
            }}
          />
          Archived only
        </label>
      </div>

      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">title</th>
              <th className="px-3 py-2 text-left">artist</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-left">updatedAt</th>
              <th className="px-3 py-2 text-left">archived</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={6}>{busy ? "Loading..." : "No records"}</td>
              </tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-3 py-2">{item.title}</td>
                <td className="px-3 py-2">{item.artist?.name ?? item.artistId}</td>
                <td className="px-3 py-2">{item.isPublished ? "published" : "draft"}</td>
                <td className="px-3 py-2">{new Date(item.updatedAt).toLocaleString()}</td>
                <td className="px-3 py-2">{item.deletedAt ? <span className="rounded border px-2 py-0.5 text-xs">Archived</span> : null}</td>
                <td className="px-3 py-2"><Link href={`/admin/artwork/${item.id}`} className="rounded border px-2 py-1 text-xs">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="rounded border px-3 py-1 text-sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button>
        <span className="text-sm">Page {page} / {maxPage}</span>
        <button type="button" className="rounded border px-3 py-1 text-sm" disabled={page >= maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>Next</button>
      </div>
    </section>
  );
}
