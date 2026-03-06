"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EntityCard } from "@/components/entities/entity-card";
import { EntityListControls } from "@/components/entities/entity-list-controls";
import { FollowButton } from "@/components/follows/follow-button";
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
};

export function ArtistsClient({ artists, total, isAuthenticated }: { artists: ArtistListItem[]; total: number; isAuthenticated: boolean }) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const sort = searchParams.get("sort") ?? "az";

  const filtered = useMemo(() => {
    const searched = artists.filter((artist) => !q || artist.name.toLowerCase().includes(q) || artist.tags.some((tag) => tag.toLowerCase().includes(q)));
    if (sort === "followers") return [...searched].sort((a, b) => b.followersCount - a.followersCount || a.name.localeCompare(b.name));
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [artists, q, sort]);

  return (
    <div className="space-y-4">
      <EntityListControls searchPlaceholder="Search artists" sortOptions={[{ value: "az", label: "A–Z" }, { value: "followers", label: "Most Followed" }]} />
      {filtered.length === 0 ? (
        <EmptyState title="No artists match your search" description="Try a different artist name or clear filters." actions={[{ label: "Reset filters", href: "/artists" }]} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((artist) => (
            <EntityCard
              key={artist.id}
              href={`/artists/${artist.slug}`}
              name={artist.name}
              subtitle={artist.tags.slice(0, 2).join(" • ") || null}
              description={artist.bio}
              imageUrl={artist.avatarImageUrl}
              imageAlt={artist.imageAlt}
              tags={artist.tags}
              action={<div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}><FollowButton targetType="ARTIST" targetId={artist.id} initialIsFollowing={artist.isFollowing} initialFollowersCount={artist.followersCount} isAuthenticated={isAuthenticated} /></div>}
              artworkCount={artist.artworkCount}
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
