"use client";

import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/events/event-card";

type RecommendedEvent = {
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
};

type RecommendedEventsProps = {
  excludeEventIds: string[];
  enabled: boolean;
};

export function RecommendedEvents({ excludeEventIds, enabled }: RecommendedEventsProps) {
  const [items, setItems] = useState<RecommendedEvent[]>([]);
  const [reason, setReason] = useState<string | null>(null);

  const excludeParam = useMemo(() => excludeEventIds.slice(0, 80).join(","), [excludeEventIds]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setReason(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (excludeParam) params.set("exclude", excludeParam);
      params.set("limit", "10");

      const response = await fetch(`/api/recommendations/events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as { items?: RecommendedEvent[]; reason?: string | null };
      if (cancelled) return;
      setItems(data.items ?? []);
      setReason(data.reason ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, excludeParam]);

  if (!enabled || items.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border bg-muted/50 p-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Because you follow{reason ? ` ${reason}` : ""}</h2>
        <p className="text-xs text-muted-foreground">Deterministic recommendations from your follow graph and event tags.</p>
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
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
