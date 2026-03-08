"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import type { EventClickArg } from "@fullcalendar/core";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import { CalendarScopeToggle, parseCalendarScope } from "@/components/calendar/calendar-scope-toggle";
import { EventFilterChips } from "@/components/events/filter-chips";
import { EventCard } from "@/components/events/event-card";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EventRow } from "@/components/events/event-row";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Section } from "@/components/ui/section";
import { SaveEventButton } from "@/components/events/save-event-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildEventQueryString, parseEventFilters } from "@/lib/events-filters";
import { track } from "@/lib/analytics/client";

type CalendarItem = {
  id: string;
  title: string;
  slug: string;
  start: string;
  end: string | null;
  venue?: { id?: string | null; name?: string | null } | null;
  artistIds?: string[];
};

type EventsResponse = { items: CalendarItem[]; truncated?: boolean };

export function CalendarClient({ isAuthenticated, fixtureItems, fallbackFixtureItems }: { isAuthenticated: boolean; fixtureItems?: CalendarItem[]; fallbackFixtureItems?: CalendarItem[] }) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtersKey = searchParams?.toString() ?? "";
  const stableSearchParams = useMemo(() => new URLSearchParams(filtersKey), [filtersKey]);
  const filters = useMemo(() => parseEventFilters(stableSearchParams), [stableSearchParams]);
  const tagsKey = useMemo(() => filters.tags.join(","), [filters.tags]);
  const parsedTags = useMemo(() => (tagsKey ? tagsKey.split(",") : []), [tagsKey]);
  const scope = parseCalendarScope(searchParams?.get("scope"));
  const viewMode = searchParams?.get("view") === "agenda" ? "agenda" : "calendar";

  const [events, setEvents] = useState<CalendarItem[]>(fixtureItems ?? []);
  const [isLoading, setIsLoading] = useState(!fixtureItems);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetchEvents = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    track("calendar_viewed");
    const onToday = () => calendarRef.current?.getApi().today();
    const onFollowToggled = () => {
      if (scope === "following") refetchEvents();
    };
    const onSaveToggled = () => {
      if (scope === "saved") refetchEvents();
    };
    window.addEventListener("calendar:today", onToday);
    window.addEventListener("artpulse:follow_toggled", onFollowToggled);
    window.addEventListener("artpulse:event_saved_toggled", onSaveToggled);
    return () => {
      window.removeEventListener("calendar:today", onToday);
      window.removeEventListener("artpulse:follow_toggled", onFollowToggled);
      window.removeEventListener("artpulse:event_saved_toggled", onSaveToggled);
    };
  }, [refetchEvents, scope]);

  useEffect(() => {
    if (fixtureItems) {
      setEvents(fixtureItems);
      setIsLoading(false);
    }
  }, [fixtureItems]);

  const replaceSearch = useCallback((updates: Record<string, string | null>) => {
    const next = buildEventQueryString(stableSearchParams, updates);
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, stableSearchParams]);

  const fetchEvents = useCallback(async () => {
    if (fixtureItems || !range) return;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (tagsKey) params.set("tags", tagsKey);
    params.set("scope", scope);
    params.set("from", filters.from || range.from);
    params.set("to", filters.to || range.to);

    try {
      const response = await fetch(`/api/calendar-events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as EventsResponse;
      setEvents(data.items ?? []);
      setIsTruncated(Boolean(data.truncated));
    } catch {
      if (fallbackFixtureItems?.length) {
        setEvents(fallbackFixtureItems);
        setIsTruncated(false);
        setError(null);
      } else {
        setError("Unable to load calendar events right now.");
        setIsTruncated(false);
        setEvents([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [fallbackFixtureItems, filters.from, filters.query, fixtureItems, range, scope, tagsKey, filters.to]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents, reloadToken]);

  const activeTags = useMemo(() => parsedTags.map((tag) => tag.trim()).filter(Boolean), [parsedTags]);
  const hasActiveFilters = Boolean(filters.query || activeTags.length || filters.from || filters.to);
  const filtersQueryString = useMemo(() => buildEventQueryString(stableSearchParams, { scope: null }), [stableSearchParams]);
  const eventsHref = filtersQueryString ? `/events?${filtersQueryString}` : "/events";
  const calendarEvents = useMemo(
    () => events.map((event) => ({ id: event.id, title: event.title, start: event.start, end: event.end ?? undefined, url: `/events/${event.slug}` })),
    [events],
  );

  function openEventPanel(clickInfo: EventClickArg) {
    clickInfo.jsEvent.preventDefault();
    const event = events.find((item) => item.id === clickInfo.event.id);
    if (event) {
      track("calendar_event_opened", { eventSlug: event.slug, eventId: event.id, source: "calendar" });
      setSelectedEvent(event);
    }
  }

  return (
    <section className="space-y-4">
      <Section title="Controls" subtitle="Change scope, filters, and view mode.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CalendarScopeToggle scope={scope} />
          <Link className="text-sm underline" href={eventsHref}>Go to Events</Link>
        </div>
        <EventFilterChips filters={{ query: filters.query, tags: activeTags, from: filters.from, to: filters.to }} onRemove={replaceSearch} onClearAll={() => replaceSearch({ query: null, tags: null, from: null, to: null })} />
        {hasActiveFilters ? <InlineBanner>Filtered calendar view</InlineBanner> : null}
      </Section>

      <Section title="Calendar view">
        {error ? <ErrorCard message={error} onRetry={() => void fetchEvents()} /> : null}
        {isTruncated ? <InlineBanner>Showing first 1,000 events — narrow your date range to see all results.</InlineBanner> : null}
        {viewMode === "agenda" ? (
          events.length === 0 ? <EmptyState title="No agenda items" description="Switch back to calendar view or update filters." /> : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={`agenda-${event.id}`}><EventCard href={`/events/${event.slug}`} title={event.title} startAt={event.start} endAt={event.end} venueName={event.venue?.name ?? undefined} /></li>
              ))}
            </ul>
          )
        ) : (
          <>
            <div className="relative min-h-[600px] w-full overflow-x-hidden rounded-lg border bg-card p-2">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: "prev,next", center: "title", right: "dayGridMonth,timeGridWeek,listWeek" }}
                height="auto"
                datesSet={(info) => {
                  const from = info.startStr.slice(0, 10);
                  const to = info.endStr.slice(0, 10);
                  setRange((prev) => (prev?.from === from && prev?.to === to ? prev : { from, to }));
                }}
                events={calendarEvents}
                eventClick={openEventPanel}
              />
              {isLoading ? (
                <div className="pointer-events-none absolute inset-2 z-10 space-y-2 rounded-md bg-background/70 p-2">
                  {Array.from({ length: 3 }).map((_, i) => <EventCardSkeleton key={`calendar-loading-${i}`} />)}
                </div>
              ) : null}
            </div>
            {!isLoading && !error && events.length === 0 ? <EmptyState title="No events match these filters" description="Try broadening your filters or moving to a different date range." actions={[{ label: "Go to Events", href: eventsHref }]} /> : null}
          </>
        )}
      </Section>

      <Dialog open={Boolean(selectedEvent)} onOpenChange={(isOpen) => !isOpen && setSelectedEvent(null)}>
        <DialogContent className="left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 rounded-none p-4 sm:max-w-md" aria-describedby="calendar-event-panel-description">
          {selectedEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>Event details</DialogTitle>
                <DialogDescription id="calendar-event-panel-description">Quick actions for this selected event.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-3">
                <EventRow href={`/events/${selectedEvent.slug}`} title={selectedEvent.title} startAt={selectedEvent.start} endAt={selectedEvent.end} venueName={selectedEvent.venue?.name ?? undefined} />
                <div className="flex flex-wrap gap-2">
                  <SaveEventButton eventId={selectedEvent.id} initialSaved={scope === "saved"} nextUrl="/calendar" isAuthenticated={isAuthenticated} analytics={{ eventSlug: selectedEvent.slug, ui: "calendar_panel" }} />
                  <Link href={`/events/${selectedEvent.slug}`} className="rounded border px-3 py-2 text-sm">View details</Link>
                  {typeof navigator !== "undefined" && navigator.share ? (
                    <button
                      type="button"
                      className="rounded border px-3 py-2 text-sm"
                      onClick={() => navigator.share?.({ title: selectedEvent.title, url: `${window.location.origin}/events/${selectedEvent.slug}` })}
                    >
                      Share
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border px-3 py-2 text-sm"
                      onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/events/${selectedEvent.slug}`)}
                    >
                      Copy link
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
