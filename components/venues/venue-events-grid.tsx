"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/events/event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

type VenueEvent = {
  id: string;
  title: string;
  slug: string;
  startAt: Date;
  endAt: Date | null;
  imageUrl: string | null;
  imageAlt: string;
  tags: string[];
};

type Props = {
  events: VenueEvent[];
  venueName: string;
};

type DateFilter = "all" | "this-week" | "this-month";

export function VenueEventsGrid({ events, venueName }: Props) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const allTags = useMemo(() => {
    const unique = new Set<string>();
    for (const event of events) {
      for (const tag of event.tags) unique.add(tag);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return events.filter((event) => {
      const tagMatches = !activeTag || event.tags.includes(activeTag);
      const dateMatches = dateFilter === "all"
        ? true
        : dateFilter === "this-week"
          ? event.startAt <= endOfWeek
          : event.startAt <= endOfMonth;

      return tagMatches && dateMatches;
    });
  }, [events, activeTag, dateFilter]);

  const showFilters = events.length > 5;
  const showTagFilters = allTags.length >= 2;

  return (
    <div className="space-y-3">
      {showFilters ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border p-1">
              <Button type="button" size="sm" variant={dateFilter === "all" ? "default" : "ghost"} onClick={() => setDateFilter("all")}>All</Button>
              <Button type="button" size="sm" variant={dateFilter === "this-week" ? "default" : "ghost"} onClick={() => setDateFilter("this-week")}>This week</Button>
              <Button type="button" size="sm" variant={dateFilter === "this-month" ? "default" : "ghost"} onClick={() => setDateFilter("this-month")}>This month</Button>
            </div>
            {showTagFilters ? allTags.map((tag) => (
              <Button key={tag} type="button" size="sm" variant={activeTag === tag ? "default" : "outline"} onClick={() => setActiveTag((current) => current === tag ? null : tag)}>
                {tag}
              </Button>
            )) : null}
          </div>
          <p className="text-sm text-muted-foreground">{filteredEvents.length} events</p>
        </>
      ) : null}

      {filteredEvents.length === 0 ? (
        <EmptyState title="No matching events" description="No events match the current filters." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              href={`/events/${event.slug}`}
              title={event.title}
              startAt={event.startAt}
              endAt={event.endAt}
              venueName={venueName}
              imageUrl={event.imageUrl}
              imageAlt={event.imageAlt}
              tags={event.tags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
