"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { EVENT_TYPE_OPTIONS, type EventTypeOption, getEventTypeLabel } from "@/lib/event-types";

type VenueOption = { id: string; name: string };

type Props = {
  venues: VenueOption[];
  buttonLabel?: string;
  defaultStartAt?: string;
  defaultEndAt?: string;
  defaultVenueId?: string;
  showCreateAnotherAction?: boolean;
};

function isoToLocalDatetimeValue(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function CreateEventForm({ venues, buttonLabel = "Create event", defaultStartAt, defaultEndAt, defaultVenueId, showCreateAnotherAction = false }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(isoToLocalDatetimeValue(defaultStartAt));
  const [endAt, setEndAt] = useState(isoToLocalDatetimeValue(defaultEndAt));
  const [venueId, setVenueId] = useState(defaultVenueId ?? (venues.length === 1 ? venues[0]!.id : ""));
  const [ticketUrl, setTicketUrl] = useState("");
  const [eventType, setEventType] = useState<EventTypeOption>("OTHER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasVenues = venues.length > 0;
  const canSubmit = useMemo(() => title.trim().length >= 2 && Boolean(startAt), [title, startAt]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const createAnother = submitter?.value === "create-another";
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);

    const payload = {
      title,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : undefined,
      venueId: venueId || undefined,
      ticketUrl: ticketUrl || undefined,
      timezone: "UTC",
      eventType,
    };

    const res = await fetch("/api/my/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body?.error?.message ?? "Failed to create event");
      setIsSubmitting(false);
      return;
    }

    enqueueToast({ title: "Event created", variant: "success" });

    if (createAnother) {
      const destination = venueId ? `/my/events/new?venueId=${encodeURIComponent(venueId)}` : "/my/events/new";
      router.push(destination);
      return;
    }

    router.push(`/my/events/${body.event.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-3 rounded border p-4">
      <label className="block">
        <span className="text-sm">Title</span>
        <input className="w-full rounded border p-2" required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm">Start date/time</span>
        <input className="w-full rounded border p-2" type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm">End date/time (optional)</span>
        <input className="w-full rounded border p-2" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
      </label>
      {hasVenues ? (
        <label className="block">
          <span className="text-sm">Venue (optional)</span>
          <select className="w-full rounded border p-2" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
            <option value="">No venue yet</option>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have no managed venues yet. <Link className="underline" href="/my/venues/new">Create a venue first</Link>. You can still create this draft now and attach a venue later.
        </p>
      )}
      <label className="block">
        <span className="text-sm">Event type</span>
        <select className="w-full rounded border p-2" value={eventType} onChange={(event) => setEventType(event.target.value as EventTypeOption)}>
          {EVENT_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{getEventTypeLabel(value)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm">Ticket URL (optional)</span>
        <input className="w-full rounded border p-2" type="url" value={ticketUrl} onChange={(event) => setTicketUrl(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit || isSubmitting}>{isSubmitting ? "Creating..." : buttonLabel}</Button>
        {showCreateAnotherAction ? (
          <Button type="submit" value="create-another" variant="outline" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create & create another"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
