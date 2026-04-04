"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/events/event-card";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";

type TrendingEvent = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  venue?: { id: string; name: string } | null;
  tags?: Array<{ slug: string }>;
  primaryImageUrl?: string | null;
  image?: {
    url: string | null;
    isProcessing?: boolean;
    hasFailure?: boolean;
  };
  score: number;
};

export function TrendingEvents() {
  const [items, setItems] = useState<TrendingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/trending/events", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { items?: TrendingEvent[] };
        if (!cancelled) setItems(data.items ?? []);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <section className="space-y-2 rounded-lg border bg-muted/50 p-3" aria-busy="true" aria-live="polite">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Trending</h2>
          <p className="text-xs text-muted-foreground">Based on saves and collections from the last 24 hours.</p>
        </div>
        <EventCardSkeleton />
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className="space-y-2 rounded-lg border bg-muted/50 p-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Trending</h2>
        <p className="text-xs text-muted-foreground">Based on saves and collections from the last 24 hours.</p>
      </div>
      <ul className="space-y-2">
        {items.map((event) => (
          <li key={event.id}>
            <EventCard
              href={`/events/${event.slug}`}
              title={event.title}
              startAt={event.startAt}
              endAt={event.endAt}
              venueName={event.venue?.name}
              image={event.image}
              imageUrl={event.primaryImageUrl}
              badges={(event.tags ?? []).slice(0, 3).map((tag) => tag.slug)}
              secondaryText={`${event.score} saves`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
