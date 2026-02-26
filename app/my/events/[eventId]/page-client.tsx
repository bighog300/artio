"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { FeaturedEventImagePanel } from "@/app/my/events/_components/FeaturedEventImagePanel";

function toLocalDatetime(date: string) {
  const parsed = new Date(date);
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function EventFieldSaveForm({ eventId, payload, children }: { eventId: string; payload: () => Record<string, unknown>; children: ReactNode }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/my/events/${eventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
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
    <form onSubmit={onSave} className="space-y-3 rounded border p-4">
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
    </form>
  );
}

export function EventBasicsForm({ event }: { event: { id: string; title: string } }) {
  const [title, setTitle] = useState(event.title);

  return (
    <EventFieldSaveForm eventId={event.id} payload={() => ({ title })}>
      <label className="block" id="title"><span className="text-sm">Title</span><input className="w-full rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    </EventFieldSaveForm>
  );
}

export function EventScheduleForm({ event }: { event: { id: string; startAt: Date; endAt: Date | null } }) {
  const [startAt, setStartAt] = useState(toLocalDatetime(event.startAt.toISOString()));
  const [endAt, setEndAt] = useState(event.endAt ? toLocalDatetime(event.endAt.toISOString()) : "");

  return (
    <EventFieldSaveForm eventId={event.id} payload={() => ({ startAt: new Date(startAt).toISOString(), endAt: endAt ? new Date(endAt).toISOString() : null })}>
      <label className="block" id="startAt"><span className="text-sm">Start at</span><input className="w-full rounded border p-2" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
      <label className="block" id="endAt"><span className="text-sm">End at</span><input className="w-full rounded border p-2" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
    </EventFieldSaveForm>
  );
}

export function EventLinksForm({ event }: { event: { id: string; ticketUrl: string | null } }) {
  const [ticketUrl, setTicketUrl] = useState(event.ticketUrl ?? "");

  return (
    <EventFieldSaveForm eventId={event.id} payload={() => ({ ticketUrl: ticketUrl || null })}>
      <label className="block" id="ticketUrl"><span className="text-sm">Ticket URL</span><input className="w-full rounded border p-2" type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} /></label>
    </EventFieldSaveForm>
  );
}

export function EventImagesForm({ event }: { event: { id: string; featuredAssetId: string | null; featuredAsset: { url: string | null } | null } }) {
  return <FeaturedEventImagePanel eventId={event.id} featuredAssetId={event.featuredAssetId} featuredImageUrl={event.featuredAsset?.url ?? null} />;
}
