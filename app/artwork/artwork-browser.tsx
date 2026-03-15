"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArtworkFilterSidebar } from "@/components/artwork/artwork-filter-sidebar";
import { ArtworkCard, type ArtworkListItem } from "@/components/artwork/artwork-card";
import { ArtworkActiveFilters } from "@/components/artwork/artwork-active-filters";
import { SaveSearchDialog } from "@/components/artwork/save-search-dialog";
import { SavedSearchesRail } from "@/components/artwork/saved-searches-rail";

type MediumOption = { name: string; count: number };
type ArtistResult = { id: string; name: string; slug: string };

const SORTS = [
  ["RECENT", "Recently updated"],
  ["OLDEST", "Oldest"],
  ["YEAR_DESC", "Year (newest)"],
  ["YEAR_ASC", "Year (oldest)"],
  ["PRICE_ASC", "Price (low to high)"],
  ["PRICE_DESC", "Price (high to low)"],
  ["VIEWS_30D_DESC", "Most viewed (30d)"],
] as const;

const FALLBACK_MEDIUMS: MediumOption[] = [
  { name: "Painting", count: 0 },
  { name: "Sculpture", count: 0 },
  { name: "Photography", count: 0 },
  { name: "Digital", count: 0 },
  { name: "Mixed Media", count: 0 },
  { name: "Installation", count: 0 },
];

export function ArtworkBrowser({
  signedIn,
  mediumOptions,
  savedSearches = [],
}: {
  signedIn: boolean;
  mediumOptions: MediumOption[];
  savedSearches?: Array<{ id: string; name: string; params: Record<string, unknown> }>;
}) {
  const availableMediums = mediumOptions.length > 0 ? mediumOptions : FALLBACK_MEDIUMS;
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Items state
  const [items, setItems] = useState<ArtworkListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("artwork-view") as "grid" | "list") ?? "grid";
  });

  // Filter draft state
  const [queryDraft, setQueryDraft] = useState(sp?.get("query") ?? "");

  // Artist autocomplete state
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);

  const queryString = sp?.toString() ?? "";
  const page = Number(sp?.get("page") ?? "1");
  const pageSize = Number(sp?.get("pageSize") ?? "20");
  const isViewsSort = (sp?.get("sort") ?? "RECENT") === "VIEWS_30D_DESC";
  const hasFilters = useMemo(() => (sp?.toString() ?? "").length > 0, [sp]);

  // URL param helper
  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp?.toString() ?? "");
    Object.entries(updates).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    if (Object.keys(updates).some((key) => key !== "page")) next.set("page", "1");
    router.replace(
      next.toString() ? `${pathname}?${next.toString()}` : pathname,
      { scroll: false },
    );
  }

  // Debounce text search → URL
  useEffect(() => {
    const t = setTimeout(() => setParam({ query: queryDraft || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft]);

  // Fetch artworks with abort controller
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/artwork?${queryString}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setItems([]);
          setTotal(0);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryString]);

  // Fetch favourites (artwork only)
  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/favorites?targetType=ARTWORK")
      .then((res) => res.json())
      .then((data) => {
        const ids = (data?.items ?? [])
          .filter((item: { targetId?: string }) => typeof item.targetId === "string")
          .map((item: { targetId: string }) => item.targetId);
        setFavoriteIds(new Set(ids));
      })
      .catch(() => setFavoriteIds(new Set()));
  }, [signedIn]);

  // Artist autocomplete
  useEffect(() => {
    const q = artistQuery.trim();
    if (!q) {
      setArtistResults([]);
      setArtistDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setArtistSearching(true);
      try {
        const res = await fetch(
          `/api/artists?query=${encodeURIComponent(q)}&limit=8&status=PUBLISHED`,
        );
        const data = await res.json();
        setArtistResults(data.artists ?? data.items ?? []);
        setArtistDropdownOpen(true);
      } catch {
        setArtistResults([]);
      } finally {
        setArtistSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [artistQuery]);

  async function toggleFavorite(artworkId: string) {
    const isSaved = favoriteIds.has(artworkId);
    const next = new Set(favoriteIds);
    if (isSaved) next.delete(artworkId);
    else next.add(artworkId);
    setFavoriteIds(next);
    try {
      const res = await fetch("/api/favorites", {
        method: isSaved ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "ARTWORK", targetId: artworkId }),
      });
      if (!res.ok) {
        const revert = new Set(next);
        if (isSaved) revert.add(artworkId);
        else revert.delete(artworkId);
        setFavoriteIds(revert);
      }
    } catch {
      const revert = new Set(next);
      if (isSaved) revert.add(artworkId);
      else revert.delete(artworkId);
      setFavoriteIds(revert);
    }
  }

  function setViewAndPersist(next: "grid" | "list") {
    setView(next);
    localStorage.setItem("artwork-view", next);
  }

  return (
    <div className="space-y-4">
      {/* Saved searches rail */}
      {savedSearches.length > 0 && (
        <SavedSearchesRail searches={savedSearches} />
      )}

      {/* Mobile filter toggle */}
      <div className="md:hidden">
        <button
          className="rounded border px-3 py-1 text-sm"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Filter sidebar */}
        <ArtworkFilterSidebar
          sp={sp ?? new URLSearchParams()}
          availableMediums={availableMediums}
          setParam={setParam}
          queryDraft={queryDraft}
          onQueryDraftChange={setQueryDraft}
          artistQuery={artistQuery}
          onArtistQueryChange={setArtistQuery}
          artistResults={artistResults}
          artistSearching={artistSearching}
          artistDropdownOpen={artistDropdownOpen}
          onArtistDropdownOpenChange={setArtistDropdownOpen}
          selectedArtistName={selectedArtistName}
          onArtistSelect={(artist) => {
            setParam({ artistId: artist.id });
            setSelectedArtistName(artist.name);
            setArtistQuery("");
            setArtistDropdownOpen(false);
          }}
          onArtistClear={() => {
            setParam({ artistId: null });
            setSelectedArtistName(null);
            setArtistQuery("");
          }}
          filtersOpen={filtersOpen}
        />

        <section className="space-y-3">
          {/* Sort bar + view toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              className="rounded border p-2 text-sm"
              value={sp?.get("sort") ?? "RECENT"}
              onChange={(e) => setParam({ sort: e.target.value })}
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded border p-0.5">
                <button
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${view === "grid" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
                  onClick={() => setViewAndPersist("grid")}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${view === "list" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
                  onClick={() => setViewAndPersist("list")}
                >
                  List
                </button>
              </div>

              {/* Save search */}
              {hasFilters && signedIn && (
                <button
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => setSaveOpen(true)}
                >
                  Save search
                </button>
              )}
              {hasFilters && !signedIn && (
                <a href="/api/auth/signin" className="text-xs text-muted-foreground underline">
                  Sign in to save
                </a>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          <ArtworkActiveFilters
            searchParams={sp ?? new URLSearchParams()}
            artistName={selectedArtistName}
          />

          {/* Inline save-search prompt */}
          {hasFilters && signedIn && (
            <p className="text-xs text-muted-foreground">
              Get weekly updates for these results?{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setSaveOpen(true)}
              >
                Save search →
              </button>
            </p>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-52 animate-pulse rounded border bg-muted" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="rounded border p-6 text-sm">
              No artworks found.{" "}
              <button className="underline" onClick={() => router.replace(pathname)}>
                Clear filters
              </button>
            </div>
          )}

          {/* Grid */}
          {!loading && items.length > 0 && (
            <div className={
              view === "grid"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-2"
            }>
              {items.map((item) => (
                <ArtworkCard
                  key={item.id}
                  item={item}
                  view={view}
                  isSaved={favoriteIds.has(item.id)}
                  signedIn={signedIn}
                  isViewsSort={isViewsSort}
                  onToggleFavorite={(id) => void toggleFavorite(id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span>{total} results</span>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                className="rounded border px-2 py-1 disabled:opacity-50"
                onClick={() => setParam({ page: String(page - 1) })}
              >
                Prev
              </button>
              <button
                disabled={page * pageSize >= total}
                className="rounded border px-2 py-1 disabled:opacity-50"
                onClick={() => setParam({ page: String(page + 1) })}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Save search dialog */}
      <SaveSearchDialog
        open={saveOpen && signedIn}
        onOpenChange={setSaveOpen}
        searchParams={sp ?? new URLSearchParams()}
      />
    </div>
  );
}
