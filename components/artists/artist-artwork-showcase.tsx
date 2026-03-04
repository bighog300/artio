"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArtworkSummary } from "@/lib/artists";
import { ArtistArtworkLightbox } from "@/components/artists/artist-artwork-lightbox";
import { ArtworkShowcaseCard } from "@/components/artists/artwork-showcase-card";
import { FeaturedWorksStrip } from "@/components/artists/featured-works-strip";

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (tag) params.set("tag", tag);
      if (forSale) params.set("forSale", "true");
      params.set("sort", sort);
      const res = await fetch(`/api/artists/${artistSlug}/artworks?${params.toString()}`);
      const body = await res.json();
      if (!cancelled && res.ok) {
        setArtworks(body.artworks);
        setCursor(body.nextCursor);
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [artistSlug, tag, forSale, sort]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (forSale) params.set("forSale", "true");
    params.set("sort", sort);
    params.set("cursor", cursor);
    const res = await fetch(`/api/artists/${artistSlug}/artworks?${params.toString()}`);
    const body = await res.json();
    if (res.ok) {
      setArtworks((current) => [...current, ...body.artworks]);
      setCursor(body.nextCursor);
    }
    setLoading(false);
  }

  const featured = useMemo(() => artworks.filter((item) => item.featured), [artworks]);

  return (
    <section className="space-y-4">
      <FeaturedWorksStrip artworks={featured} onSelect={setSelected} />
      <div className="flex flex-wrap items-center gap-2 rounded border bg-card p-3">
        <button type="button" onClick={() => setTag("")} className={`rounded-full px-3 py-1 text-sm ${tag === "" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>All</button>
        {availableTags.map((item) => <button key={item} type="button" onClick={() => setTag(item)} className={`rounded-full px-3 py-1 text-sm ${tag === item ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{item}</button>)}
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={forSale} onChange={(event) => setForSale(event.target.checked)} />For sale only</label>
        <select value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest" | "az")} className="rounded border bg-background px-2 py-1 text-sm">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="az">A–Z</option>
        </select>
        <div className="flex rounded border">
          <button type="button" onClick={() => setView("grid")} className={`px-2 py-1 text-sm ${view === "grid" ? "bg-muted" : ""}`}>Grid</button>
          <button type="button" onClick={() => setView("list")} className={`px-2 py-1 text-sm ${view === "list" ? "bg-muted" : ""}`}>List</button>
        </div>
      </div>

      <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
        {artworks.map((artwork) => <ArtworkShowcaseCard key={artwork.id} artwork={artwork} view={view} onClick={() => setSelected(artwork)} />)}
      </div>

      {artworks.length === 0 && !loading ? <p className="text-sm text-muted-foreground">No artworks found.</p> : null}
      {cursor ? <button type="button" onClick={() => void loadMore()} className="rounded border px-4 py-2 text-sm" disabled={loading}>{loading ? "Loading..." : "Load more"}</button> : null}
      <p className="text-xs text-muted-foreground">Showing {artworks.length} of {totalCount}</p>
      <ArtistArtworkLightbox artwork={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
