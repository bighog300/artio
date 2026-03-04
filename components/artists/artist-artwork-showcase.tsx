"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArtworkSummary } from "@/lib/artists";
import { ArtistArtworkLightbox } from "@/components/artists/artist-artwork-lightbox";
import { ArtworkShowcaseCard } from "@/components/artists/artwork-showcase-card";
import { FeaturedWorksStrip } from "@/components/artists/featured-works-strip";
import { EntityCardSkeleton } from "@/components/entities/entity-card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function ArtistArtworkShowcase({
  artistSlug,
  initialArtworks,
  initialNextCursor,
  totalCount,
  availableTags,
}: {
  artistSlug: string;
  initialArtworks: ArtworkSummary[];
  initialNextCursor: string | null;
  totalCount: number;
  availableTags: string[];
}) {
  const [tag, setTag] = useState<string>("");
  const [forSale, setForSale] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest" | "az">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [artworks, setArtworks] = useState(initialArtworks);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ArtworkSummary | null>(null);

  async function fetchArtworks(next: { tag: string; forSale: boolean; sort: "newest" | "oldest" | "az"; cursor?: string }) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (next.tag) params.set("tag", next.tag);
      if (next.forSale) params.set("forSale", "true");
      params.set("sort", next.sort);
      if (next.cursor) params.set("cursor", next.cursor);
      const res = await fetch(`/api/artists/${artistSlug}/artworks?${params.toString()}`);
      const body = await res.json();
      if (res.ok) {
        if (next.cursor) {
          setArtworks((current) => [...current, ...body.artworks]);
        } else {
          setArtworks(body.artworks);
        }
        setCursor(body.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchArtworks({ tag, forSale, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistSlug]);

  function handleTagChange(nextTag: string) {
    setTag(nextTag);
    setCursor(null);
    setArtworks([]);
    void fetchArtworks({ tag: nextTag, forSale, sort });
  }

  function handleForSaleChange(nextForSale: boolean) {
    setForSale(nextForSale);
    setCursor(null);
    setArtworks([]);
    void fetchArtworks({ tag, forSale: nextForSale, sort });
  }

  function handleSortChange(nextSort: "newest" | "oldest" | "az") {
    setSort(nextSort);
    setCursor(null);
    setArtworks([]);
    void fetchArtworks({ tag, forSale, sort: nextSort });
  }

  async function loadMore() {
    if (!cursor || loading) return;
    await fetchArtworks({ tag, forSale, sort, cursor });
  }

  const featured = useMemo(() => artworks.filter((item) => item.featured), [artworks]);

  return (
    <section className="space-y-4">
      <FeaturedWorksStrip artworks={featured} onSelect={setSelected} />
      <div className="flex flex-wrap items-center gap-2 rounded border bg-card p-3">
        <button type="button" onClick={() => handleTagChange("")} className={`rounded-full px-3 py-1 text-sm ${tag === "" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>All</button>
        {availableTags.map((item) => <button key={item} type="button" onClick={() => handleTagChange(item)} className={`rounded-full px-3 py-1 text-sm ${tag === item ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{item}</button>)}
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={forSale} onChange={(event) => handleForSaleChange(event.target.checked)} />For sale only</label>
        <select value={sort} onChange={(event) => handleSortChange(event.target.value as "newest" | "oldest" | "az")} className="rounded border bg-background px-2 py-1 text-sm">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="az">A–Z</option>
        </select>
        <div className="flex rounded border">
          <button type="button" onClick={() => setView("grid")} className={`px-2 py-1 text-sm ${view === "grid" ? "bg-muted" : ""}`}>Grid</button>
          <button type="button" onClick={() => setView("list")} className={`px-2 py-1 text-sm ${view === "list" ? "bg-muted" : ""}`}>List</button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EntityCardSkeleton />
          <EntityCardSkeleton />
          <EntityCardSkeleton />
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
          {artworks.map((artwork) => <ArtworkShowcaseCard key={artwork.id} artwork={artwork} view={view} onClick={() => setSelected(artwork)} />)}
        </div>
      )}

      {artworks.length === 0 && !loading ? <EmptyState title="No artworks found" description="Try changing filters to see more works." /> : null}
      {cursor ? <button type="button" onClick={() => void loadMore()} className="rounded border px-4 py-2 text-sm" disabled={loading}>{loading ? "Loading..." : "Load more"}</button> : null}
      <p className="text-xs text-muted-foreground">Showing {artworks.length} of {totalCount}</p>
      <ArtistArtworkLightbox artwork={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
