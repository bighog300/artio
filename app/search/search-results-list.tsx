"use client";

import Link from "next/link";
import { EventCard } from "@/components/events/event-card";
import { GalleryCard } from "@/components/galleries/gallery-card";
import { trackEngagement } from "@/lib/engagement-client";
import { usePathname, useSearchParams } from "next/navigation";

type EventResult = {
  type: "event";
  id: string;
  slug: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  venueName?: string | null;
  venueSlug?: string | null;
};

type GalleryResult = {
  type: "gallery";
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  creatorName: string;
  creatorHref: string;
  itemCount: number;
  savesCount: number;
};

type CreatorResult = {
  type: "creator";
  id: string;
  slug: string;
  name: string;
  bio?: string | null;
  artworksCount: number;
};

type VenueResult = {
  type: "venue";
  id: string;
  slug: string;
  name: string;
  city?: string | null;
};

type SearchResult = EventResult | GalleryResult | CreatorResult | VenueResult;

export function SearchResultsList({ items, query, nextCursor }: { items: SearchResult[]; query?: string; nextCursor?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loadMoreHref = (() => {
    if (!nextCursor) return null;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("cursor", nextCursor);
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((item, index) => {
          if (item.type === "event") {
            return (
              <li key={`${item.type}:${item.id}`} onClick={() => trackEngagement({ surface: "SEARCH", action: "CLICK", targetType: "EVENT", targetId: item.id, meta: { position: index, query: query?.slice(0, 120) } })}>
                <EventCard
                  href={`/events/${item.slug}`}
                  title={item.title}
                  startAt={item.startAt}
                  endAt={item.endAt}
                  venueName={item.venueName}
                  venueSlug={item.venueSlug}
                />
              </li>
            );
          }
          if (item.type === "gallery") {
            return (
              <li key={`${item.type}:${item.id}`}>
                <GalleryCard
                  id={item.id}
                  title={item.title}
                  description={item.description}
                  coverUrl={item.coverUrl}
                  creator={{ name: item.creatorName, href: item.creatorHref }}
                  itemCount={item.itemCount}
                  savesCount={item.savesCount}
                />
              </li>
            );
          }
          if (item.type === "creator") {
            return (
              <li key={`${item.type}:${item.id}`}>
                <Link href={`/artists/${item.slug}`} className="block rounded-xl border p-4 hover:bg-muted/30">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Creator</p>
                  <p className="font-medium">{item.name}</p>
                  {item.bio ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.bio}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">{item.artworksCount} published artworks</p>
                </Link>
              </li>
            );
          }
          return (
            <li key={`${item.type}:${item.id}`}>
              <Link href={`/venues/${item.slug}`} className="block rounded-xl border p-4 hover:bg-muted/30">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Venue</p>
                <p className="font-medium">{item.name}</p>
                {item.city ? <p className="text-sm text-muted-foreground">{item.city}</p> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {loadMoreHref ? (
        <Link href={loadMoreHref} className="inline-flex rounded border px-3 py-2 text-sm hover:bg-muted">
          Load more
        </Link>
      ) : null}
    </div>
  );
}
