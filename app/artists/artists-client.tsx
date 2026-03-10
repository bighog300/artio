"use client";

import { useMemo } from "react";
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

export function ArtistsClient({ artists, total, isAuthenticated }: { artists: ArtistListItem[]; total: number; isAuthenticated: boolean }) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const sort = searchParams.get("sort") ?? "az";

  const filtered = useMemo(() => {
    const searched = artists.filter((artist) => !q || artist.name.toLowerCase().includes(q) || artist.tags.some((tag) => tag.toLowerCase().includes(q)));
    if (sort === "followers") return [...searched].sort((a, b) => b.followersCount - a.followersCount || a.name.localeCompare(b.name));
    if (sort === "forsale") return [...searched].sort((a, b) => (b.forSaleCount ?? 0) - (a.forSaleCount ?? 0) || a.name.localeCompare(b.name));
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [artists, q, sort]);

  return (
    <div className="space-y-4">
      <EntityListControls
        searchPlaceholder="Search artists"
        sortOptions={[{ value: "az", label: "A–Z" }, { value: "followers", label: "Most Followed" }, { value: "forsale", label: "Most For Sale" }]}
      />
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
      {total > artists.length ? (
        <p className="text-sm text-muted-foreground text-center">
          Showing {artists.length} of {total} artists
        </p>
      ) : null}
    </div>
  );
}
