"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { FeaturedEventImagePanel } from "@/app/my/events/_components/FeaturedEventImagePanel";
import { EVENT_TYPE_OPTIONS, type EventTypeOption, getEventTypeLabel } from "@/lib/event-types";

function toLocalDatetime(date: string) {
  const parsed = new Date(date);
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

type VenueOption = { id: string; name: string };

type EventEditorProps = {
  event: {
    id: string;
    title: string;
    venueId: string | null;
    startAt: string;
    endAt: string | null;
    ticketUrl: string | null;
    eventType: EventTypeOption | null;
    featuredAssetId: string | null;
    featuredAsset: { url: string | null } | null;
  };
  venues: VenueOption[];
};

export function EventEditorForm({ event, venues }: EventEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(event.title);
  const [venueId, setVenueId] = useState(event.venueId ?? "");
  const [startAt, setStartAt] = useState(toLocalDatetime(event.startAt));
  const [endAt, setEndAt] = useState(event.endAt ? toLocalDatetime(event.endAt) : "");
  const [ticketUrl, setTicketUrl] = useState(event.ticketUrl ?? "");
  const [eventType, setEventType] = useState<EventTypeOption>(event.eventType ?? "OTHER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/my/events/${event.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        venueId: venueId || null,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        ticketUrl: ticketUrl || null,
        eventType,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error?.message ?? "Failed to save event");
      setSaving(false);
      return;
    }

    enqueueToast({ title: "Event saved", variant: "success" });
    router.refresh();
    setSaving(false);
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <section className="space-y-3 rounded border p-4">
        <label className="block" id="title"><span className="text-sm">Title</span><input className="w-full rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block" id="eventType">
          <span className="text-sm">Event type</span>
          <select className="w-full rounded border p-2" value={eventType} onChange={(e) => setEventType(e.target.value as EventTypeOption)}>
            {EVENT_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{getEventTypeLabel(value)}</option>)}
          </select>
        </label>
        <label className="block" id="venueId">
          <span className="text-sm">Venue (optional)</span>
          <select className="w-full rounded border p-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">No venue yet</option>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </label>
      </section>

      <section className="space-y-3 rounded border p-4">
        <label className="block" id="startAt"><span className="text-sm">Start at</span><input className="w-full rounded border p-2" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <label className="block" id="endAt"><span className="text-sm">End at</span><input className="w-full rounded border p-2" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
      </section>

      <section className="space-y-3 rounded border p-4">
        <label className="block" id="ticketUrl"><span className="text-sm">Ticket URL</span><input className="w-full rounded border p-2" type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} /></label>
      </section>

      <section className="space-y-3 rounded border p-4">
        <FeaturedEventImagePanel eventId={event.id} featuredAssetId={event.featuredAssetId} featuredImageUrl={event.featuredAsset?.url ?? null} />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
    </form>
  );
}
