"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics/client";
import { EventCard } from "@/components/events/event-card";
import { EventRailCard } from "@/components/events/event-rail-card";
import { EventRow } from "@/components/events/event-row";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EventsFiltersBar } from "@/components/events/events-filters-bar";
import { SaveEventButton } from "@/components/events/save-event-button";
import { TrendingEvents } from "@/components/events/trending-events";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/error-card";
import type { UiFixtureEvent } from "@/lib/ui-fixtures";
import { resolveEntityPrimaryImage } from "@/lib/public-images";

type EventListItem = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  venue?: { id?: string; name?: string | null; city?: string | null } | null;
  tags?: Array<{ slug: string }>;
  featuredImageUrl?: string | null;
  images?: Array<{
    url?: string | null;
    alt?: string | null;
    sortOrder?: number | null;
    isPrimary?: boolean | null;
    asset?: { url?: string | null } | null;
  }>;
  artworkCount?: number;
};

type EventsResponse = { items: EventListItem[]; nextCursor: string | null };
type FavoriteItem = { targetType: string; targetId: string };

const EVENT_LIMIT = 24;

export function EventsClient({ isAuthenticated, fixtureItems, fallbackFixtureItems }: { isAuthenticated: boolean; fixtureItems?: UiFixtureEvent[]; fallbackFixtureItems?: UiFixtureEvent[] }) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<EventListItem[]>(fixtureItems ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!fixtureItems);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const latestFetchIdRef = useRef(0);

  const fetchEvents = useCallback(async (cursor?: string | null) => {
    if (fixtureItems) return;
    const fetchId = latestFetchIdRef.current + 1;
    latestFetchIdRef.current = fetchId;
    if (cursor) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setItems([]);
    }
    setError(null);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("cursor");
    params.set("limit", String(EVENT_LIMIT));
    if (cursor) params.set("cursor", cursor);

    try {
      const response = await fetch(`/api/events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("request_failed");
      const data = (await response.json()) as EventsResponse;
      if (latestFetchIdRef.current !== fetchId) return;
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch {
      if (latestFetchIdRef.current !== fetchId) return;
      if (fallbackFixtureItems?.length && !cursor) {
        setItems(fallbackFixtureItems);
      } else {
        setError("Unable to load events right now.");
      }
      setNextCursor(null);
    } finally {
      if (latestFetchIdRef.current !== fetchId) return;
      if (cursor) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }, [fallbackFixtureItems, fixtureItems, searchParams]);

  useEffect(() => { void fetchEvents(null); }, [fetchEvents]);

  useEffect(() => {
    track("events_list_viewed", { source: "events" });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const query = searchParams?.get("query") ?? "";
      const from = searchParams?.get("from") ?? "";
      const to = searchParams?.get("to") ?? "";
      const tags = (searchParams?.get("tags") ?? "").split(",").filter(Boolean);
      const sortParam = searchParams?.get("sort") ?? "soonest";
      const datePreset = from && to ? (from === to ? "today" : "range") : "all";
      const filtersAppliedCount = [query.trim(), from, to, tags.length ? "tags" : "", sortParam !== "soonest" ? sortParam : ""].filter(Boolean).length;
      track("events_filters_changed", {
        hasQuery: Boolean(query.trim()),
        queryLength: query.trim().length,
        datePreset,
        sort: sortParam,
        tagsCount: tags.length,
        filtersAppliedCount,
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFavoriteIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/favorites", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { items?: FavoriteItem[] };
        if (cancelled) return;
        setFavoriteIds(new Set((data.items ?? []).filter((item) => item.targetType === "EVENT").map((item) => item.targetId)));
      } catch {
        if (!cancelled) setFavoriteIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((item) => (item.tags ?? []).map((tag) => tag.slug)))).slice(0, 8), [items]);
  const sort = searchParams?.get("sort") ?? "soonest";

  const visibleItems = useMemo(() => {
    const sorted = [...items];
    if (sort === "popular") {
      sorted.sort((a, b) => (b.tags?.length ?? 0) - (a.tags?.length ?? 0));
    }
    return sorted;
  }, [items, sort]);

  const thisWeekendEvents = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + 7);

    return visibleItems
      .filter((event) => {
        const start = new Date(event.startAt);
        return start >= now && start <= cutoff;
      })
      .slice(0, 3);
  }, [visibleItems]);

  const quickPickEvents = useMemo(() => {
    const thisWeekendIds = new Set(thisWeekendEvents.map((event) => event.id));

    return visibleItems
      .filter((event) => !thisWeekendIds.has(event.id))
      .slice(0, 6);
  }, [thisWeekendEvents, visibleItems]);

  return (
    <section className="space-y-6">
      <EventsFiltersBar availableTags={allTags} />
      {isAuthenticated && favoriteIds.size === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">Tip: Save events to build your calendar.</p>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Trending now</h2>
        <div className="overflow-x-auto pb-2"><TrendingEvents /></div>
      </section>

      {error ? <ErrorCard message={error} onRetry={() => void fetchEvents(null)} /> : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 6 }).map((_, index) => <EventCardSkeleton key={`event-skeleton-${index}`} />)}
        </div>
      ) : null}

      {!isLoading && !error && visibleItems.length === 0 ? (
        <EmptyState
          title="No events match your filters"
          description="Try changing dates, removing tags, or exploring nearby events."
          actions={[{ label: "Browse Nearby", href: "/nearby", variant: "secondary" }]}
        />
      ) : null}

      {!isLoading && visibleItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((event) => (
              <div key={event.id} onClick={() => track("event_viewed", { eventSlug: event.slug, source: "events", ui: "card" })}><EventCard
                href={`/events/${event.slug}`}
                title={event.title}
                startAt={event.startAt}
                endAt={event.endAt}
                venueName={event.venue?.name}
                imageUrl={resolveEntityPrimaryImage(event)?.url ?? null}
                imageAlt={resolveEntityPrimaryImage(event)?.alt}
                badges={(event.tags ?? []).map((tag) => tag.slug)}
                action={<SaveEventButton eventId={event.id} initialSaved={favoriteIds.has(event.id)} nextUrl={`/events?${searchParams?.toString() ?? ""}`} isAuthenticated={isAuthenticated} analytics={{ eventSlug: event.slug }} />}
                artworkCount={event.artworkCount ?? 0}
              /></div>
            ))}
          </div>

          {thisWeekendEvents.length >= 2 ? (
            <div className="space-y-2">
              <h3 className="text-base font-semibold tracking-tight">This weekend</h3>
              <div className="grid gap-2">
                {thisWeekendEvents.map((event) => (
                  <div key={`row-${event.id}`} onClick={() => track("event_viewed", { eventSlug: event.slug, source: "events", ui: "row" })}><EventRow
                    href={`/events/${event.slug}`}
                    title={event.title}
                    startAt={event.startAt}
                    endAt={event.endAt}
                    venueName={event.venue?.name}
                    action={<SaveEventButton eventId={event.id} initialSaved={favoriteIds.has(event.id)} nextUrl={`/events?${searchParams?.toString() ?? ""}`} isAuthenticated={isAuthenticated} analytics={{ eventSlug: event.slug }} />}
                  /></div>
                ))}
              </div>
            </div>
          ) : null}

          {quickPickEvents.length >= 2 ? (
            <div className="space-y-3">
              <h3 className="text-base font-semibold tracking-tight">Quick picks</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {quickPickEvents.map((event) => (
                  <div key={`rail-${event.id}`} onClick={() => track("event_viewed", { eventSlug: event.slug, source: "events", ui: "rail" })}><EventRailCard
                    href={`/events/${event.slug}`}
                    title={event.title}
                    startAt={event.startAt}
                    endAt={event.endAt}
                    venueName={event.venue?.name}
                    imageUrl={resolveEntityPrimaryImage(event)?.url ?? null}
                    imageAlt={resolveEntityPrimaryImage(event)?.alt}
                  /></div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {!isLoading && !error && nextCursor ? (
        <div>
          <Button type="button" variant="outline" onClick={() => void fetchEvents(nextCursor)} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
