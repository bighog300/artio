"use client";

import { useRouter } from "next/navigation";

type MediumOption = { name: string; count: number };

type ArtistResult = { id: string; name: string; slug: string };

type FilterSidebarProps = {
  sp: URLSearchParams;
  availableMediums: MediumOption[];
  setParam: (updates: Record<string, string | null>) => void;
  queryDraft: string;
  onQueryDraftChange: (value: string) => void;
  // Artist autocomplete
  artistQuery: string;
  onArtistQueryChange: (value: string) => void;
  artistResults: ArtistResult[];
  artistSearching: boolean;
  artistDropdownOpen: boolean;
  onArtistDropdownOpenChange: (open: boolean) => void;
  selectedArtistName: string | null;
  onArtistSelect: (artist: ArtistResult) => void;
  onArtistClear: () => void;
  // Mobile
  filtersOpen: boolean;
};

export function ArtworkFilterSidebar({
  sp,
  availableMediums,
  setParam,
  queryDraft,
  onQueryDraftChange,
  artistQuery,
  onArtistQueryChange,
  artistResults,
  artistSearching,
  artistDropdownOpen,
  onArtistDropdownOpenChange,
  selectedArtistName,
  onArtistSelect,
  onArtistClear,
  filtersOpen,
}: FilterSidebarProps) {
  const router = useRouter();
  const mediums = sp.getAll("medium");
  const hasFilters = sp.toString().length > 0;

  return (
    <aside
      className={`space-y-3 rounded border p-3 ${filtersOpen ? "block" : "hidden"} md:block`}
    >
      {/* Text search */}
      <input
        value={queryDraft}
        onChange={(e) => onQueryDraftChange(e.target.value)}
        placeholder="Search title or description"
        className="w-full rounded border p-2 text-sm"
      />

      {/* Medium filter */}
      <div>
        <p className="text-xs font-semibold uppercase">Medium</p>
        <div className="mt-1 space-y-1">
          {availableMediums.map(({ name, count }) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mediums.includes(name)}
                onChange={() => {
                  const next = mediums.includes(name)
                    ? mediums.filter((m) => m !== name)
                    : [...mediums, name];
                  const params = new URLSearchParams(sp.toString());
                  params.delete("medium");
                  next.forEach((m) => params.append("medium", m));
                  params.set("page", "1");
                  router.replace(
                    params.toString() ? `/artwork?${params.toString()}` : "/artwork",
                    { scroll: false },
                  );
                }}
              />
              <span className="flex-1">{name}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground">({count})</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Artist filter */}
      <div>
        <p className="text-xs font-semibold uppercase">Artist</p>
        {sp.get("artistId") && selectedArtistName ? (
          <div className="mt-1 flex items-center justify-between rounded border px-2 py-1 text-sm">
            <span>{selectedArtistName}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={onArtistClear}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="relative mt-1">
            <input
              className="w-full rounded border p-2 text-sm"
              placeholder="Search artists…"
              value={artistQuery}
              onChange={(e) => onArtistQueryChange(e.target.value)}
              onFocus={() =>
                artistResults.length > 0 && onArtistDropdownOpenChange(true)
              }
              onBlur={() =>
                setTimeout(() => onArtistDropdownOpenChange(false), 150)
              }
            />
            {artistSearching && (
              <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">
                …
              </span>
            )}
            {artistDropdownOpen && artistResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border bg-background shadow-md">
                {artistResults.map((artist) => (
                  <li key={artist.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={() => onArtistSelect(artist)}
                    >
                      {artist.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Year range */}
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded border p-2 text-sm"
          placeholder="Year from"
          defaultValue={sp.get("yearFrom") ?? ""}
          onBlur={(e) => setParam({ yearFrom: e.target.value || null })}
        />
        <input
          className="rounded border p-2 text-sm"
          placeholder="Year to"
          defaultValue={sp.get("yearTo") ?? ""}
          onBlur={(e) => setParam({ yearTo: e.target.value || null })}
        />
      </div>

      {/* Price range */}
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded border p-2 text-sm"
          placeholder="Price min (£)"
          defaultValue={sp.get("priceMin") ?? ""}
          onBlur={(e) => setParam({ priceMin: e.target.value || null })}
        />
        <input
          className="rounded border p-2 text-sm"
          placeholder="Price max (£)"
          defaultValue={sp.get("priceMax") ?? ""}
          onBlur={(e) => setParam({ priceMax: e.target.value || null })}
        />
      </div>

      {/* Currency */}
      <select
        className="w-full rounded border p-2 text-sm"
        value={sp.get("currency") ?? ""}
        onChange={(e) => setParam({ currency: e.target.value || null })}
      >
        <option value="">Any currency</option>
        <option value="USD">USD</option>
        <option value="GBP">GBP</option>
        <option value="EUR">EUR</option>
      </select>

      {/* Boolean filters */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sp.get("hasImages") === "true"}
          onChange={(e) =>
            setParam({ hasImages: e.target.checked ? "true" : null })
          }
        />
        Has images
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sp.get("hasPrice") === "true"}
          onChange={(e) =>
            setParam({ hasPrice: e.target.checked ? "true" : null })
          }
        />
        Has price
      </label>

      {/* Clear filters */}
      {hasFilters && (
        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={() => router.replace("/artwork")}
        >
          Clear filters
        </button>
      )}
    </aside>
  );
}
