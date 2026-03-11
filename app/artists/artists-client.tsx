"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArtistCard } from "@/components/artists/artist-card";
import { EntityListControls } from "@/components/entities/entity-list-controls";
import { EmptyState } from "@/components/ui/empty-state";

type ArtistListItem = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatarImageUrl: string | null;
  imageAlt: string | null;
  tags: string[];
  followersCount: number;
  isFollowing: boolean;
  artworkCount: number;
  forSaleCount: number;
};

type ArtistListResponse = {
  items: ArtistListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type ArtistFilter = "all" | "artworks" | "forsale";

export function ArtistsClient({
  artists: initialArtists,
  total,
  nextPage,
  isAuthenticated,
}: {
  artists: ArtistListItem[];
  total: number;
  nextPage: number | null;
  isAuthenticated: boolean;
}) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "az";

  const [artists, setArtists] = useState(initialArtists);
  const [filter, setFilter] = useState<ArtistFilter>("all");
  const [currentPage, setCurrentPage] = useState<number>(nextPage ?? 2);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(total > initialArtists.length);

  const artistsWithArtworksCount = useMemo(() => artists.filter((artist) => artist.artworkCount > 0).length, [artists]);
  const artistsWithForSaleCount = useMemo(() => artists.filter((artist) => (artist.forSaleCount ?? 0) > 0).length, [artists]);
  const showForSaleFilter = artistsWithForSaleCount > 0;

  useEffect(() => {
    setArtists(initialArtists);
    setCurrentPage(nextPage ?? 2);
    setHasMore(total > initialArtists.length);
  }, [initialArtists, nextPage, total, q, sort]);

  const filtered = useMemo(() => {
    const qNormalized = q.toLowerCase();
    let filteredArtists = artists.filter(
      (artist) => !qNormalized || artist.name.toLowerCase().includes(qNormalized) || artist.tags.some((tag) => tag.toLowerCase().includes(qNormalized)),
    );

    if (filter === "artworks") {
      filteredArtists = filteredArtists.filter((artist) => artist.artworkCount > 0);
    }

    if (filter === "forsale") {
      filteredArtists = filteredArtists.filter((artist) => (artist.forSaleCount ?? 0) > 0);
    }

    return filteredArtists;
  }, [artists, q, filter]);

  const loadMore = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/artists?page=${currentPage}&pageSize=48&query=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}`);
      if (!response.ok) return;
      const payload: ArtistListResponse = await response.json();
      setArtists((prev) => {
        const nextArtists = [...prev, ...payload.items];
        setHasMore(payload.total > nextArtists.length);
        return nextArtists;
      });
      setCurrentPage((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <EntityListControls
        searchPlaceholder="Search artists"
        sortOptions={[{ value: "az", label: "A–Z" }, { value: "followers", label: "Most Followed" }, { value: "forsale", label: "Most For Sale" }]}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3 py-1 text-sm ${
            filter === "all" ? "bg-foreground text-background" : "bg-background text-foreground"
          }`}
        >
          All artists
        </button>
        <button
          type="button"
          onClick={() => setFilter("artworks")}
          className={`rounded-full border px-3 py-1 text-sm ${
            filter === "artworks" ? "bg-foreground text-background" : "bg-background text-foreground"
          }`}
        >
          Has artworks ({artistsWithArtworksCount})
        </button>
        {showForSaleFilter ? (
          <button
            type="button"
            onClick={() => setFilter("forsale")}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === "forsale" ? "bg-foreground text-background" : "bg-background text-foreground"
            }`}
          >
            Has works for sale ({artistsWithForSaleCount})
          </button>
        ) : null}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No artists match your search" description="Try a different artist name or clear filters." actions={[{ label: "Reset filters", href: "/artists" }]} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((artist) => (
            <ArtistCard
              key={artist.id}
              href={`/artists/${artist.slug}`}
              name={artist.name}
              bio={artist.bio}
              imageUrl={artist.avatarImageUrl}
              tags={artist.tags}
              artistId={artist.id}
              initialFollowing={artist.isFollowing}
              isAuthenticated={isAuthenticated}
              artworkCount={artist.artworkCount}
              forSaleCount={artist.forSaleCount}
            />
          ))}
        </div>
      )}
      {hasMore ? (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {isLoading ? "Loading…" : `Load more (${total - artists.length} remaining)`}
          </button>
        </div>
      ) : null}
      {total > artists.length ? (
        <p className="text-sm text-muted-foreground text-center">
          Showing {artists.length} of {total} artists
        </p>
      ) : null}
    </div>
  );
}
