"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EntityCard } from "@/components/entities/entity-card";
import { EntityListControls } from "@/components/entities/entity-list-controls";
import { FollowButton } from "@/components/follows/follow-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type VenueListItem = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string | null;
  imageUrl: string | null;
  image: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
  imageAlt: string | null;
  followersCount: number;
  isFollowing: boolean;
  artworkCount: number;
};

export function VenuesClient({ venues, cities, isAuthenticated }: { venues: VenueListItem[]; cities: string[]; isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const sort = searchParams.get("sort") ?? "az";
  const city = searchParams.get("city") ?? "";

  const update = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const filtered = useMemo(() => {
    const searched = venues.filter(
      (venue) =>
        (!q || venue.name.toLowerCase().includes(q) || venue.subtitle.toLowerCase().includes(q)) &&
        (!city || venue.subtitle.toLowerCase().includes(city.toLowerCase()))
    );

    if (sort === "followers") return [...searched].sort((a, b) => b.followersCount - a.followersCount || a.name.localeCompare(b.name));
    if (sort === "artworks") return [...searched].sort((a, b) => (b.artworkCount ?? 0) - (a.artworkCount ?? 0) || a.name.localeCompare(b.name));

    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [venues, q, city, sort]);

  const hasFilters = Boolean(q) || Boolean(city) || sort !== "az";

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-[1fr_auto_auto_auto]">
        <EntityListControls
          searchPlaceholder="Search venues"
          sortOptions={[
            { value: "az", label: "A–Z" },
            { value: "followers", label: "Most Followed" },
            { value: "artworks", label: "Most Artworks" },
          ]}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm ui-trans hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={city}
          onChange={(e) => update({ city: e.target.value || null })}
          aria-label="Filter by city"
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {hasFilters ? (
          <Button type="button" variant="ghost" className="ui-trans ui-press" onClick={() => update({ q: null, sort: null, city: null })}>
            Reset
          </Button>
        ) : null}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No venues match your search" description="Try a different venue name or clear filters." actions={[{ label: "Reset filters", href: "/venues" }]} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((venue) => (
            <EntityCard
              key={venue.id}
              href={`/venues/${venue.slug}`}
              name={venue.name}
              subtitle={venue.subtitle}
              description={venue.description}
              imageUrl={venue.imageUrl}
              image={venue.image}
              imageAlt={venue.imageAlt}
              action={<div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}><FollowButton targetType="VENUE" targetId={venue.id} initialIsFollowing={venue.isFollowing} initialFollowersCount={venue.followersCount} isAuthenticated={isAuthenticated} /></div>}
              artworkCount={venue.artworkCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
