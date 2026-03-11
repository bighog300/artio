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
  featuredImageUrl?: string | null;
  description?: string | null;
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

  function setViewMode(next: "calendar" | "agenda") {
    const params = new URLSearchParams(searchParams?.toString());
    if (next === "agenda") {
      params.set("view", "agenda");
    } else {
      params.delete("view");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const [events, setEvents] = useState<CalendarItem[]>(fixtureItems ?? []);
  const [isLoading, setIsLoading] = useState(!fixtureItems);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);
  const [queryInput, setQueryInput] = useState(filters.query ?? "");

  const refetchEvents = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    track("calendar_viewed");
    const onFollowToggled = () => {
      if (scope === "following") refetchEvents();
    };
    const onSaveToggled = () => {
      if (scope === "saved") refetchEvents();
    };
    window.addEventListener("artio:follow_toggled", onFollowToggled);
    window.addEventListener("artio:event_saved_toggled", onSaveToggled);
    return () => {
      window.removeEventListener("artio:follow_toggled", onFollowToggled);
      window.removeEventListener("artio:event_saved_toggled", onSaveToggled);
    };
  }, [refetchEvents, scope]);

  useEffect(() => {
    if (fixtureItems) {
      setEvents(fixtureItems);
      setIsLoading(false);
    }
  }, [fixtureItems]);

  useEffect(() => {
    setQueryInput(filters.query ?? "");
  }, [filters.query]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768 && searchParams?.get("view") === null) {
      setViewMode("agenda");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const filtersQueryString = useMemo(() => buildEventQueryString(stableSearchParams, { scope: null }), [stableSearchParams]);
  const eventsHref = filtersQueryString ? `/events?${filtersQueryString}` : "/events";
  const calendarEvents = useMemo(
    () => events.map((event) => ({ id: event.id, title: event.title, start: event.start, end: event.end ?? undefined, url: `/events/${event.slug}` })),
    [events],
  );
  const agendaGroups = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const event of events) {
      const dateKey = new Date(event.start).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(event);
    }
    return Array.from(groups.entries());
  }, [events]);
  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

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
      <div className="space-y-3">
        <div className="space-y-2 pb-2">
          <div className="space-y-2">
            <CalendarScopeToggle scope={scope} />
            <div className="flex items-center justify-between gap-2">
              <div className="rounded-md border p-0.5 text-sm">
                <button
                  type="button"
                  className={`rounded px-2 py-1 ${viewMode === "calendar" ? "bg-foreground text-background" : "text-foreground"}`}
                  onClick={() => setViewMode("calendar")}
                  aria-pressed={viewMode === "calendar"}
                >
                  Month/Week
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-1 ${viewMode === "agenda" ? "bg-foreground text-background" : "text-foreground"}`}
                  onClick={() => setViewMode("agenda")}
                  aria-pressed={viewMode === "agenda"}
                >
                  List
                </button>
              </div>
              <div className="flex items-center gap-2">
                {viewMode === "calendar" ? (
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm"
                    onClick={() => calendarRef.current?.getApi().today()}
                  >
                    Today
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm"
                    onClick={() => {
                      document.getElementById("agenda-today")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Today
                  </button>
                )}
                {isAuthenticated && scope === "saved" ? (
                  <a
                    href="/api/calendar-events/saved"
                    className="rounded border px-3 py-1 text-sm"
                    title="Subscribe to your saved events calendar feed"
                  >
                    Export feed
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search events…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  replaceSearch({ query: queryInput.trim() || null });
                }
                if (e.key === "Escape") {
                  setQueryInput("");
                  replaceSearch({ query: null });
                }
              }}
              className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Search events"
            />
            {queryInput ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setQueryInput("");
                  replaceSearch({ query: null });
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <EventFilterChips filters={{ query: filters.query, tags: activeTags, from: filters.from, to: filters.to }} onRemove={replaceSearch} onClearAll={() => replaceSearch({ query: null, tags: null, from: null, to: null })} />
      </div>

      {error ? <ErrorCard message={error} onRetry={() => void fetchEvents()} /> : null}
      {isTruncated ? <InlineBanner>Showing first 1,000 events — narrow your date range to see all results.</InlineBanner> : null}
      {viewMode === "agenda" ? (
        events.length === 0 ? (
          scope === "saved" ? (
            <EmptyState title="No saved events in this range" description="Save events you're interested in and they'll appear here." actions={[{ label: "Browse Events", href: eventsHref }]} />
          ) : scope === "following" ? (
            <EmptyState title="No upcoming events from people you follow" description="Follow venues and artists to see their events here." actions={[{ label: "Browse Events", href: eventsHref }]} />
          ) : (
            <EmptyState title="No events in this date range" description="Try moving to a different month or broadening your filters." />
          )
        ) : (
          <div className="space-y-4">
            {agendaGroups.map(([dateLabel, groupEvents]) => (
              <div key={dateLabel} id={dateLabel === todayLabel ? "agenda-today" : undefined}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {dateLabel}
                </p>
                <ul className="space-y-2">
                  {groupEvents.map((event) => (
                    <li key={`agenda-${event.id}`}>
                      <EventCard
                        href={`/events/${event.slug}`}
                        title={event.title}
                        startAt={event.start}
                        endAt={event.end}
                        venueName={event.venue?.name ?? undefined}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="relative min-h-[420px] md:min-h-[600px] w-full overflow-x-hidden rounded-lg border bg-card p-2">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView="dayGridMonth"
              initialDate={calendarDate ?? undefined}
              headerToolbar={{
                left: "prev,next",
                center: "title",
                right: "dayGridMonth,timeGridWeek",
              }}
              buttonText={{
                month: "Month",
                week: "Week",
              }}
              height="auto"
              datesSet={(info) => {
                const from = info.startStr.slice(0, 10);
                const to = info.endStr.slice(0, 10);
                setRange((prev) => (prev?.from === from && prev?.to === to ? prev : { from, to }));
                setCalendarDate(info.view.currentStart);
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
          {!isLoading && !error && events.length === 0 ? (
            scope === "saved" ? (
              <EmptyState
                title="No saved events in this range"
                description="Save events you're interested in and they'll appear here."
                actions={[{ label: "Browse Events", href: eventsHref }]}
              />
            ) : scope === "following" ? (
              <EmptyState
                title="No upcoming events from people you follow"
                description="Follow venues and artists to see their events here."
                actions={[{ label: "Browse Events", href: eventsHref }]}
              />
            ) : (
              <EmptyState
                title="No events in this date range"
                description="Try moving to a different month or broadening your filters."
                actions={[{ label: "Browse Events", href: eventsHref }]}
              />
            )
          ) : null}
        </>
      )}

      <Dialog open={Boolean(selectedEvent)} onOpenChange={(isOpen) => !isOpen && setSelectedEvent(null)}>
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto h-auto max-h-[85vh] w-full translate-x-0 translate-y-0 overflow-y-auto rounded-t-xl rounded-b-none p-4 md:inset-x-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-full md:max-w-md md:rounded-none" aria-describedby="calendar-event-panel-description">
          <div
            className="mx-auto mb-3 h-1.5 w-10 cursor-grab rounded-full bg-muted active:cursor-grabbing md:hidden"
            onTouchStart={(e) => {
              const startY = e.touches[0].clientY;
              const onTouchMove = (moveEvent: TouchEvent) => {
                const delta = moveEvent.touches[0].clientY - startY;
                if (delta > 60) {
                  setSelectedEvent(null);
                  document.removeEventListener("touchmove", onTouchMove);
                }
              };
              document.addEventListener("touchmove", onTouchMove, { passive: true });
              const onTouchEnd = () => {
                document.removeEventListener("touchmove", onTouchMove);
                document.removeEventListener("touchend", onTouchEnd);
              };
              document.addEventListener("touchend", onTouchEnd, { passive: true });
            }}
          />
          {selectedEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>Event details</DialogTitle>
                <DialogDescription id="calendar-event-panel-description">Quick actions for this selected event.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-3">
                {selectedEvent.featuredImageUrl ? (
                  <div className="relative h-36 w-full overflow-hidden rounded-lg bg-muted">
                    <img
                      src={selectedEvent.featuredImageUrl}
                      alt={selectedEvent.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <EventRow href={`/events/${selectedEvent.slug}`} title={selectedEvent.title} startAt={selectedEvent.start} endAt={selectedEvent.end} venueName={selectedEvent.venue?.name ?? undefined} />
                {selectedEvent.description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {selectedEvent.description}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <SaveEventButton eventId={selectedEvent.id} initialSaved={scope === "saved"} nextUrl="/calendar" isAuthenticated={isAuthenticated} analytics={{ eventSlug: selectedEvent.slug, ui: "calendar_panel" }} />
                  <a
                    href={`/api/events/${selectedEvent.slug}/ical`}
                    download
                    className="rounded border px-3 py-2 text-sm"
                    onClick={() => track("calendar_event_ical_download", { eventSlug: selectedEvent.slug, ui: "calendar_panel" })}
                  >
                    Add to Calendar
                  </a>
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
