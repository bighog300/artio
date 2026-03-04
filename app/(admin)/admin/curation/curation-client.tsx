"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { enqueueToast } from "@/lib/toast";

type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  itemCount: number;
  publishStartsAt?: string | null;
  publishEndsAt?: string | null;
  homeRank?: number | null;
  showOnHome?: boolean;
  showOnArtwork?: boolean;
};
type Artwork = { id: string; title: string; slug?: string | null; artist: { name: string }; isPublished: boolean };
type QaRow = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  state: "FUTURE" | "EXPIRED" | "ACTIVE" | "ALWAYS" | "DRAFT";
  pinned: boolean;
  homeRank: number | null;
  flags: string[];
  counts: { totalItems: number; unpublishedArtworks: number; missingCover: number; publishBlocked: number; duplicatesInOtherCollections: number };
  suggestedActions: string[];
  adminEditHref: string;
  publicHref: string | null;
};
type PreviewItem = { artworkId: string; title: string; slug: string | null; isPublished: boolean; coverOk: boolean; completeness: { requiredOk: boolean; scorePct: number } };

function toDateTimeLocalInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminCurationClient() {
  const [tab, setTab] = useState<"collections" | "qa">("collections");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [artworkSearch, setArtworkSearch] = useState("");
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [qaRows, setQaRows] = useState<QaRow[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ artworkId: string; collections: Array<{ isPublished: boolean }> }>>([]);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [homeOrderIds, setHomeOrderIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState({ publishStartsAt: "", publishEndsAt: "", showOnHome: true, showOnArtwork: true });
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artworkSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCollections() {
    const res = await fetch(`/api/admin/curation/collections?query=${encodeURIComponent(search)}`);
    const body = await res.json();
    if (res.ok) {
      const next = body.collections ?? [];
      setCollections(next);
      setHomeOrderIds(next.filter((c: Collection) => c.homeRank != null).sort((a: Collection, b: Collection) => (a.homeRank ?? 999) - (b.homeRank ?? 999)).map((c: Collection) => c.id));
    }
  }

  async function loadQa() {
    const res = await fetch("/api/admin/curation/qa");
    const body = await res.json();
    if (!res.ok) return;
    setQaRows(body.byCollection ?? []);
    setDuplicates(body.duplicates ?? []);
  }

  async function loadArtworks() {
    const res = await fetch(`/api/admin/artwork/search?query=${encodeURIComponent(artworkSearch)}&published=true`);
    const body = await res.json();
    if (res.ok) setArtworks(body.artworks ?? []);
  }

  async function loadItems(collectionId: string) {
    const res = await fetch(`/api/admin/curation/collections/${collectionId}/items`);
    const body = await res.json();
    if (res.ok) setItems((body.items ?? []).map((item: { id: string }) => item.id));
  }

  async function loadPreview(collectionId: string) {
    const res = await fetch(`/api/admin/curation/collections/${collectionId}/preview`);
    const body = await res.json();
    if (res.ok) setPreviewItems(body.items ?? []);
  }

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void loadCollections();
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (artworkSearchTimerRef.current) clearTimeout(artworkSearchTimerRef.current);
    artworkSearchTimerRef.current = setTimeout(() => {
      void loadArtworks();
    }, 250);
    return () => {
      if (artworkSearchTimerRef.current) clearTimeout(artworkSearchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkSearch]);

  useEffect(() => {
    if (tab === "qa") void loadQa();
  }, [tab]);

  async function submitCreateCollection() {
    setCreateError(null);
    if (!createTitle.trim() || !createSlug.trim()) {
      setCreateError("Title and slug are required.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(createSlug.trim())) {
      setCreateError("Slug must be lowercase letters, numbers, and hyphens only.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/curation/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: createTitle.trim(), slug: createSlug.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCreateError(body?.error?.message ?? "Create failed.");
        return;
      }
      setCreateOpen(false);
      setCreateTitle("");
      setCreateSlug("");
      await loadCollections();
      enqueueToast({ title: "Collection created" });
    } catch {
      setCreateError("Unexpected error.");
      enqueueToast({ title: "Create failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveItems() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/curation/collections/${selected.id}/items`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkIds: items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Save failed", message: body?.error?.message ?? "Could not save items.", variant: "error" });
        return;
      }
      await loadCollections();
      await loadQa();
      enqueueToast({ title: "Items saved" });
    } catch {
      enqueueToast({ title: "Save failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(collection: Collection) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/curation/collections/${collection.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isPublished: !collection.isPublished }) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Update failed", message: body?.error?.message ?? "Could not update publish state.", variant: "error" });
        return;
      }
      await loadCollections();
      await loadQa();
      enqueueToast({ title: collection.isPublished ? "Collection unpublished" : "Collection published" });
    } catch {
      enqueueToast({ title: "Update failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!selected) return;
    const start = schedule.publishStartsAt ? new Date(schedule.publishStartsAt).toISOString() : null;
    const end = schedule.publishEndsAt ? new Date(schedule.publishEndsAt).toISOString() : null;
    if (start && end && new Date(start).getTime() >= new Date(end).getTime()) {
      enqueueToast({ title: "Invalid schedule", message: "Publish start must be before publish end.", variant: "error" });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/curation/collections/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishStartsAt: start, publishEndsAt: end, showOnHome: schedule.showOnHome, showOnArtwork: schedule.showOnArtwork }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Save failed", message: body?.error?.message ?? "Could not save settings.", variant: "error" });
        return;
      }
      await loadCollections();
      await loadQa();
      enqueueToast({ title: "Settings saved" });
    } catch {
      enqueueToast({ title: "Save failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveHomeOrder() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/curation/collections/home-order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: homeOrderIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Save failed", message: body?.error?.message ?? "Could not save homepage order.", variant: "error" });
        return;
      }
      await loadCollections();
      await loadQa();
      enqueueToast({ title: "Homepage order saved" });
    } catch {
      enqueueToast({ title: "Save failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function pinCollection(collectionId: string) {
    if (homeOrderIds.includes(collectionId)) return;
    setHomeOrderIds((current) => [...current, collectionId]);
  }

  async function unpinCollection(collectionId: string) {
    setBusy(true);
    try {
      setHomeOrderIds((current) => current.filter((id) => id !== collectionId));
      const res = await fetch(`/api/admin/curation/collections/${collectionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ homeRank: null }) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Unpin failed", message: body?.error?.message ?? "Could not unpin collection.", variant: "error" });
        return;
      }
      await loadCollections();
      await loadQa();
      enqueueToast({ title: "Collection unpinned" });
    } catch {
      enqueueToast({ title: "Unpin failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteCollection(collectionId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/curation/collections/${collectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        enqueueToast({ title: "Delete failed", message: body?.error?.message ?? "Could not delete collection.", variant: "error" });
        return;
      }
      if (selected?.id === collectionId) setSelected(null);
      setDeleteTargetId(null);
      await loadCollections();
      enqueueToast({ title: "Collection deleted" });
    } catch {
      enqueueToast({ title: "Delete failed", message: "Unexpected error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  function moveIndex(index: number, direction: -1 | 1) {
    const next = [...homeOrderIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setHomeOrderIds(next);
  }

  const duplicateWarningCount = useMemo(() => {
    const selectedInPublishedDupes = new Set(
      duplicates
        .filter((dup) => dup.collections.filter((collection) => collection.isPublished).length > 1)
        .map((dup) => dup.artworkId),
    );
    return items.filter((id) => selectedInPublishedDupes.has(id)).length;
  }, [duplicates, items]);

  useEffect(() => {
    if (!selected) return;
    setSchedule({
      publishStartsAt: toDateTimeLocalInput(selected.publishStartsAt),
      publishEndsAt: toDateTimeLocalInput(selected.publishEndsAt),
      showOnHome: selected.showOnHome ?? true,
      showOnArtwork: selected.showOnArtwork ?? true,
    });
  }, [selected]);

  const pinnedCollections = homeOrderIds.map((id) => collections.find((collection) => collection.id === id)).filter((collection): collection is Collection => Boolean(collection));

  return <div className="space-y-4">
    <div className="flex gap-2 border-b pb-2 text-sm">
      <button className={tab === "collections" ? "font-semibold underline" : "text-muted-foreground"} onClick={() => setTab("collections")}>Collections</button>
      <button className={tab === "qa" ? "font-semibold underline" : "text-muted-foreground"} onClick={() => setTab("qa")}>QA</button>
    </div>

    {tab === "collections" ? <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="space-y-3 rounded border p-3">
        <div className="flex justify-between gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search collections" className="w-full rounded border px-2 py-1 text-sm" /><button
          onClick={() => {
            setCreateOpen((v) => !v);
            setCreateError(null);
          }}
          className="rounded border px-2 py-1 text-sm"
          disabled={busy}
        >
          {createOpen ? "Cancel" : "New"}
        </button></div>
        {createOpen ? (
          <div className="space-y-2 rounded border p-3 text-sm">
            <p className="font-medium">New collection</p>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Title"
              className="w-full rounded border px-2 py-1"
            />
            <input
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder="slug-lowercase-hyphen"
              className="w-full rounded border px-2 py-1"
            />
            {createError ? <p className="text-xs text-red-600">{createError}</p> : null}
            <button
              className="rounded border px-2 py-1 disabled:opacity-50"
              disabled={busy}
              onClick={() => void submitCreateCollection()}
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        ) : null}
        <div className="space-y-1">
          {collections.map((collection) => <div key={collection.id} className={`rounded border p-2 ${selected?.id === collection.id ? "bg-muted" : ""}`}>
            <button className="text-left" disabled={busy} onClick={() => { setSelected(collection); void loadItems(collection.id); }}>{collection.title} ({collection.itemCount})</button>
            <div className="flex gap-3 text-xs">
              <button className="underline" disabled={busy} onClick={() => void togglePublished(collection)}>{collection.isPublished ? "Unpublish" : "Publish"}</button>
              <button className="underline" disabled={busy} onClick={() => void loadPreview(collection.id)}>Preview</button>
              <button className="underline" disabled={busy} onClick={() => void pinCollection(collection.id)}>Pin</button>
              <button className="underline" disabled={busy} onClick={() => void unpinCollection(collection.id)}>Unpin</button>
              {deleteTargetId === collection.id ? (
                <>
                  <span className="text-red-700">Delete?</span>
                  <button className="underline text-red-700" disabled={busy} onClick={() => void deleteCollection(collection.id)}>Yes</button>
                  <button className="underline" disabled={busy} onClick={() => setDeleteTargetId(null)}>No</button>
                </>
              ) : (
                <button className="underline text-red-700" disabled={busy} onClick={() => setDeleteTargetId(collection.id)}>Delete</button>
              )}
            </div>
          </div>)}
        </div>
        <div className="space-y-2 rounded border p-2">
          <h4 className="text-sm font-medium">Homepage placement</h4>
          {pinnedCollections.map((collection, index) => <div key={collection.id} className="flex items-center justify-between gap-2 text-xs">
            <span>#{index + 1} {collection.title}</span>
            <div className="space-x-2"><button className="underline" disabled={busy} onClick={() => moveIndex(index, -1)}>Move up</button><button className="underline" disabled={busy} onClick={() => moveIndex(index, 1)}>Move down</button></div>
          </div>)}
          <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => void saveHomeOrder()}>Save home order</button>
        </div>
      </section>
      <section className="space-y-3 rounded border p-3">
        <h3 className="font-medium">{selected ? `Edit: ${selected.title}` : "Select a collection"}</h3>
        {selected ? <>
          <div className="space-y-2 rounded border p-2 text-xs">
            <p className="font-medium">Publish window</p>
            <p className="text-muted-foreground">If unset, collection is visible whenever Published is on.</p>
            <label className="block">Start <input type="datetime-local" value={schedule.publishStartsAt} onChange={(e) => setSchedule((v) => ({ ...v, publishStartsAt: e.target.value }))} className="mt-1 w-full rounded border px-2 py-1" /></label>
            <label className="block">End <input type="datetime-local" value={schedule.publishEndsAt} onChange={(e) => setSchedule((v) => ({ ...v, publishEndsAt: e.target.value }))} className="mt-1 w-full rounded border px-2 py-1" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={schedule.showOnHome} onChange={(e) => setSchedule((v) => ({ ...v, showOnHome: e.target.checked }))} />Show on Home</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={schedule.showOnArtwork} onChange={(e) => setSchedule((v) => ({ ...v, showOnArtwork: e.target.checked }))} />Show on Artwork page</label>
            <button className="rounded border px-2 py-1" disabled={busy} onClick={() => void saveSettings()}>Save settings</button>
          </div>
          {duplicateWarningCount > 0 ? <p className="rounded border border-amber-500 bg-amber-50 p-2 text-xs">{duplicateWarningCount} artworks are already featured in other published collections.</p> : null}
          <input value={artworkSearch} onChange={(e) => setArtworkSearch(e.target.value)} placeholder="Search artworks" className="w-full rounded border px-2 py-1 text-sm" />
          <div className="max-h-40 space-y-1 overflow-auto rounded border p-2">
            {artworks.map((artwork) => {
              const checked = items.includes(artwork.id);
              return <label key={artwork.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={busy} onChange={() => setItems((current) => checked ? current.filter((id) => id !== artwork.id) : [...current, artwork.id])} />{artwork.title} · {artwork.artist.name}</label>;
            })}
          </div>
          <div className="flex gap-2">
            <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => void saveItems()}>Save items</button>
            <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => void loadPreview(selected.id)}>Preview collection</button>
          </div>
          {previewItems.length ? <div className="space-y-2 rounded border p-2 text-xs">
            {previewItems.map((item) => <div key={item.artworkId} className="flex items-center justify-between gap-2 border-b pb-1">
              <div>
                <p className="font-medium">{item.title}</p>
                <div className="flex gap-2 text-muted-foreground">
                  <span>{item.isPublished ? "Published" : "Unpublished"}</span>
                  <span>{item.coverOk ? "Cover OK" : "Missing cover"}</span>
                  <span>{item.completeness.requiredOk ? "Ready" : "Needs work"}</span>
                </div>
              </div>
              <a className="underline" href={item.slug ? `/artwork/${item.slug}` : `/artwork/${item.artworkId}`}>Open artwork</a>
            </div>)}
          </div> : null}
        </> : null}
      </section>
    </div> : <section className="space-y-3 rounded border p-3">
      <h3 className="font-medium">Rail health</h3>
      <div className="hidden overflow-auto sm:block">
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Collection</th><th>Published</th><th>State</th><th>Pinned</th><th>Rank</th><th>Total items</th><th>Unpublished</th><th>Missing cover</th><th>Publish blocked</th><th>Duplicates</th><th>Flags</th><th>Suggested actions</th><th>Links</th></tr></thead>
          <tbody>
            {qaRows.map((row) => <tr key={row.id} className="border-t">
              <td>{row.title}</td><td>{row.isPublished ? "Yes" : "No"}</td><td>{row.state}</td><td>{row.pinned ? "Yes" : "No"}</td><td>{row.homeRank ?? "-"}</td><td>{row.counts.totalItems}</td><td>{row.counts.unpublishedArtworks}</td><td>{row.counts.missingCover}</td><td>{row.counts.publishBlocked}</td><td>{row.counts.duplicatesInOtherCollections}</td><td>{row.flags.join(", ")}</td>
              <td className="text-xs">
                {row.suggestedActions.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {row.suggestedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="space-y-1 text-xs">
                <a className="block underline" href={row.adminEditHref}>Edit</a>
                {row.publicHref ? (
                  <a className="block underline" href={row.publicHref} target="_blank" rel="noopener noreferrer">View live</a>
                ) : null}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </div>;
}
