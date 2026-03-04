"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  subscribeFeedLink,
}: {
  eventId: string;
  eventSlug: string;
  nextUrl: string;
  isAuthenticated: boolean;
  initialSaved: boolean;
  calendarLink: string;
  subscribeFeedLink?: string | null;
}) {
  useEffect(() => {
    track("event_viewed", { eventSlug, source: "events" });
  }, [eventSlug]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SaveEventButton eventId={eventId} initialSaved={initialSaved} nextUrl={nextUrl} isAuthenticated={isAuthenticated} analytics={{ eventSlug, ui: "detail" }} />
      <AttendEventButton eventId={eventId} nextUrl={nextUrl} isAuthenticated={isAuthenticated} analytics={{ eventSlug, ui: "detail" }} />
      <Button asChild variant="secondary" size="sm">
        <a href={calendarLink} target="_blank" rel="noreferrer" onClick={() => track("event_add_to_calendar_clicked", { eventSlug })}>Add to Calendar</a>
      </Button>
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
