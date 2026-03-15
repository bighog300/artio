"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { ArtworkGridCard, type ArtworkCardData } from "./artwork-grid-card";
import { ArtworkEditDrawer } from "./artwork-edit-drawer";

type Filter = "all" | "published" | "draft" | "in_review";
type Sort = "newest" | "title";

function resolveCoverUrl(item: {
  featuredAsset?: { url: string | null } | null;
  images?: Array<{ asset?: { url: string | null } | null }>;
}): string | null {
  if (item.featuredAsset?.url) return item.featuredAsset.url;
  return item.images?.[0]?.asset?.url ?? null;
}

export function ArtworkManagementGrid({ artistId }: { artistId: string }) {
  void artistId;
  const [artworks, setArtworks] = useState<ArtworkCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);
  const [featureBusyId, setFeatureBusyId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);

  useEffect(() => {
    void loadArtworks();
    void loadFeatured();
  }, []);

  async function loadArtworks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my/artwork");
      if (!res.ok) throw new Error("Failed to load artworks");
      const data = await res.json();
      const items = (data.artworks ?? data.items ?? []) as Array<{
        id: string;
        title: string;
        slug: string | null;
        status: string;
        isPublished: boolean;
        deletedAt: string | null;
        priceAmount: number | null;
        currency: string | null;
        featuredAsset?: { url: string | null } | null;
        images?: Array<{ asset?: { url: string | null } | null }>;
      }>;
      setArtworks(items.map((item) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        status: item.status ?? "DRAFT",
        isPublished: item.isPublished,
        deletedAt: item.deletedAt,
        priceAmount: item.priceAmount,
        currency: item.currency,
        isFeatured: false,
        coverUrl: resolveCoverUrl(item),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artworks");
    } finally {
      setLoading(false);
    }
  }

  async function loadFeatured() {
    try {
      const res = await fetch("/api/my/artist/featured-artworks");
      if (!res.ok) return;
      const data = await res.json();
      const ids = new Set<string>(
        (data.featuredArtworks ?? data.artworks ?? []).map((a: { id: string }) => a.id),
      );
      setArtworks((prev) => prev.map((a) => ({ ...a, isFeatured: ids.has(a.id) })));
    } catch {
      // non-fatal
    }
  }

  async function handleAddArtwork() {
    try {
      const res = await fetch("/api/my/artwork", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled artwork" }),
      });
      if (!res.ok) throw new Error("Failed to create artwork");
      const data = await res.json();
      const id = data.artwork?.id;
      if (id) {
        const newCard: ArtworkCardData = {
          id,
          title: "Untitled artwork",
          slug: null,
          status: "DRAFT",
          isPublished: false,
          deletedAt: null,
          priceAmount: null,
          currency: null,
          isFeatured: false,
          coverUrl: null,
        };
        setArtworks((prev) => [newCard, ...prev]);
        setActiveEditId(id);
        setDrawerOpen(true);
      }
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Failed to create artwork", variant: "error" });
    }
  }

  async function handleTogglePublish(id: string, isPublished: boolean) {
    setPublishBusyId(id);
    try {
      if (isPublished) {
        const res = await fetch(`/api/my/artwork/${id}/unpublish`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to unpublish");
        setArtworks((prev) => prev.map((a) => a.id === id ? { ...a, isPublished: false, status: "DRAFT" } : a));
        enqueueToast({ title: "Artwork unpublished" });
      } else {
        const res = await fetch(`/api/my/artwork/${id}/publish-intent`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          enqueueToast({ title: body?.message ?? "Failed to publish", variant: "error" });
          return;
        }
        const nextStatus = body.status ?? (body.outcome === "published" ? "PUBLISHED" : "IN_REVIEW");
        setArtworks((prev) => prev.map((a) => a.id === id
          ? { ...a, isPublished: nextStatus === "PUBLISHED", status: nextStatus }
          : a));
        enqueueToast({ title: body.message ?? (nextStatus === "PUBLISHED" ? "Published" : "Submitted for review") });
      }
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Action failed", variant: "error" });
    } finally {
      setPublishBusyId(null);
    }
  }

  async function handleToggleFeatured(id: string, isFeatured: boolean) {
    setFeatureBusyId(id);
    try {
      if (isFeatured) {
        await fetch(`/api/my/artist/featured-artworks`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artworkId: id }),
        });
        setArtworks((prev) => prev.map((a) => a.id === id ? { ...a, isFeatured: false } : a));
      } else {
        await fetch(`/api/my/artist/featured-artworks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artworkId: id }),
        });
        setArtworks((prev) => prev.map((a) => a.id === id ? { ...a, isFeatured: true } : a));
      }
    } catch {
      enqueueToast({ title: "Failed to update featured status", variant: "error" });
    } finally {
      setFeatureBusyId(null);
    }
  }

  function handleEdit(id: string) {
    setActiveEditId(id);
    setDrawerOpen(true);
  }

  function handleDrawerSaved(updated: Partial<ArtworkCardData> & { id: string }) {
    setArtworks((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  }

  function handleDragStart(id: string) {
    setDraggedId(id);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    setArtworks((prev) => {
      const featured = prev.filter((a) => a.isFeatured);
      const others = prev.filter((a) => !a.isFeatured);
      const draggedIdx = featured.findIndex((a) => a.id === draggedId);
      const targetIdx = featured.findIndex((a) => a.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      const reordered = [...featured];
      const [moved] = reordered.splice(draggedIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      return [...reordered, ...others];
    });
    setDraggedId(null);
  }

  async function exitDragMode() {
    setSavingOrder(true);
    setDragMode(false);
    const featuredIdsToSave = artworks.filter((a) => a.isFeatured).map((a) => a.id);
    try {
      await fetch("/api/my/artist/featured-artworks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkIds: featuredIdsToSave }),
      });
      enqueueToast({ title: "Feature order saved" });
    } catch {
      enqueueToast({ title: "Failed to save feature order", variant: "error" });
    } finally {
      setSavingOrder(false);
    }
  }

  const filtered = artworks
    .filter((a) => {
      if (filter === "published") return a.isPublished;
      if (filter === "draft") return !a.isPublished && a.status === "DRAFT" && !a.deletedAt;
      if (filter === "in_review") return a.status === "IN_REVIEW";
      return !a.deletedAt;
    })
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      return 0;
    });

  return (
    <>
      <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void handleAddArtwork()}>+ Add artwork</Button>
        <div className="flex flex-wrap gap-1">
          {(["all", "published", "draft", "in_review"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            >
              {f === "all" ? "All" : f === "published" ? "Published" : f === "draft" ? "Draft" : "In Review"}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {artworks.filter((a) => a.isFeatured).length} featured
          </span>
          {dragMode ? (
            <Button
              size="sm"
              variant="outline"
              disabled={savingOrder}
              onClick={() => void exitDragMode()}
            >
              {savingOrder ? "Saving…" : "Done reordering"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDragMode(true)}
            >
              Feature order
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          {" "}
          <button className="ml-2 underline" onClick={() => void loadArtworks()}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="animate-pulse overflow-hidden rounded-xl border bg-muted">
              <div className="aspect-[4/3] bg-muted-foreground/10" />
              <div className="h-1 bg-muted-foreground/10" />
              <div className="px-3 py-2"><div className="h-4 w-2/3 rounded bg-muted-foreground/10" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No artworks yet." : `No ${filter.replace("_", " ")} artworks.`}
          </p>
          {filter === "all" && (
            <Button size="sm" className="mt-3" onClick={() => void handleAddArtwork()}>
              Add your first artwork
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((artwork) => (
            <ArtworkGridCard
              key={artwork.id}
              artwork={artwork}
              onEdit={handleEdit}
              onTogglePublish={(id, pub) => void handleTogglePublish(id, pub)}
              onToggleFeatured={(id, feat) => void handleToggleFeatured(id, feat)}
              publishBusy={publishBusyId === artwork.id}
              featureBusy={featureBusyId === artwork.id}
              dragMode={dragMode}
              onDragStart={handleDragStart}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} artwork{filtered.length === 1 ? "" : "s"}</span>
        <Link href="/my/artwork" className="underline">Manage all artworks →</Link>
      </div>
      </section>
      <ArtworkEditDrawer
      artworkId={activeEditId}
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      onSaved={handleDrawerSaved}
      />
    </>
  );
}
