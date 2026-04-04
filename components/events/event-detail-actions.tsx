"use client";

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SaveEventButton } from "@/components/events/save-event-button";
import { AttendEventButton } from "@/components/events/attend-event-button";
import { ShareButton } from "@/components/share-button";
import { track } from "@/lib/analytics/client";

export function EventDetailActions({
  eventId,
  eventSlug,
  nextUrl,
  isAuthenticated,
  initialSaved,
  calendarLink,
  outlookCalendarLink,
  icalLink,
  subscribeFeedLink,
  ticketingMode,
}: {
  eventId: string;
  eventSlug: string;
  nextUrl: string;
  isAuthenticated: boolean;
  initialSaved: boolean;
  calendarLink: string;
  outlookCalendarLink: string;
  icalLink: string;
  subscribeFeedLink?: string | null;
  ticketingMode?: "EXTERNAL" | "RSVP" | "PAID" | null;
}) {
  useEffect(() => {
    track("event_viewed", { eventSlug, source: "events" });
  }, [eventSlug]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SaveEventButton eventId={eventId} initialSaved={initialSaved} nextUrl={nextUrl} isAuthenticated={isAuthenticated} />
      <AttendEventButton eventId={eventId} nextUrl={nextUrl} isAuthenticated={isAuthenticated} analytics={{ eventSlug, ui: "detail" }} ticketingMode={ticketingMode} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            Add to Calendar
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem asChild>
            <a href={calendarLink} target="_blank" rel="noreferrer" onClick={() => track("event_add_to_calendar_clicked", { eventSlug, provider: "google" })}>Google Calendar</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={icalLink} onClick={() => track("event_add_to_calendar_clicked", { eventSlug, provider: "ical" })}>Apple / iCal</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={outlookCalendarLink} target="_blank" rel="noreferrer" onClick={() => track("event_add_to_calendar_clicked", { eventSlug, provider: "outlook" })}>Outlook</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareButton eventSlug={eventSlug} ui="detail" />
      {subscribeFeedLink ? (
        <Button asChild variant="ghost" size="sm">
          <a href={subscribeFeedLink} target="_blank" rel="noopener noreferrer" onClick={() => track("event_calendar_feed_subscribe_clicked", { eventSlug })}>
            Subscribe to feed
          </a>
        </Button>
      ) : null}
    </div>
  );
}
