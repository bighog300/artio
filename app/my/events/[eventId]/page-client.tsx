"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { enqueueToast } from "@/lib/toast";
import { FeaturedEventImagePanel } from "@/app/my/events/_components/FeaturedEventImagePanel";
import { EVENT_TYPE_OPTIONS, type EventTypeOption, getEventTypeLabel } from "@/lib/event-types";

function toLocalDatetimeInput(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoUtc)).replace(" ", "T");
}

function localInputToUtcIso(localValue: string, tz: string): string {
  const date = new Date(localValue + ":00");
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone: tz }));
  const offset = utcDate.getTime() - tzDate.getTime();
  return new Date(date.getTime() + offset).toISOString();
}

type VenueOption = { id: string; name: string };
type SeriesOption = { id: string; title: string; slug: string };
type TicketingMode = "EXTERNAL" | "RSVP" | "PAID" | null;
type Tier = { id: string; name: string; capacity: number | null; sortOrder: number; isActive: boolean; priceAmount: number };

type EventEditorProps = {
  event: {
    id: string;
    title: string;
    venueId: string | null;
    seriesId: string | null;
    startAt: string;
    endAt: string | null;
    ticketUrl: string | null;
    description: string | null;
    eventType: EventTypeOption | null;
    featuredAssetId: string | null;
    featuredAsset: { url: string | null } | null;
    ticketingMode: TicketingMode;
    capacity: number | null;
    rsvpClosesAt: string | null;
    venueTimezone: string;
  };
  venues: VenueOption[];
};

export function EventEditorForm({ event, venues }: EventEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(event.title);
  const [venueId, setVenueId] = useState(event.venueId ?? "");
  const [seriesId, setSeriesId] = useState(event.seriesId ?? "");
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [isCreatingSeries, setIsCreatingSeries] = useState(false);
  const [startAt, setStartAt] = useState(toLocalDatetimeInput(event.startAt, event.venueTimezone));
  const [endAt, setEndAt] = useState(event.endAt ? toLocalDatetimeInput(event.endAt, event.venueTimezone) : "");
  const [ticketUrl, setTicketUrl] = useState(event.ticketUrl ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [eventType, setEventType] = useState<EventTypeOption>(event.eventType ?? "OTHER");
  const [ticketingMode, setTicketingMode] = useState<"EXTERNAL" | "RSVP" | "PAID">(event.ticketingMode === "RSVP" ? "RSVP" : event.ticketingMode === "PAID" ? "PAID" : "EXTERNAL");
  const [capacity, setCapacity] = useState(event.capacity != null ? String(event.capacity) : "");
  const [rsvpClosesAt, setRsvpClosesAt] = useState(
    event.rsvpClosesAt
      ? toLocalDatetimeInput(event.rsvpClosesAt, event.venueTimezone)
      : ""
  );
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierName, setTierName] = useState("");
  const [tierCapacity, setTierCapacity] = useState("");
  const [tierPrice, setTierPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeConnectActive, setStripeConnectActive] = useState(false);

  useEffect(() => {
    async function loadSeries() {
      if (!venueId) {
        setSeriesOptions([]);
        setSeriesId("");
        return;
      }
      try {
        const res = await fetch(`/api/my/venues/${venueId}/series`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSeriesOptions([]);
          enqueueToast({ title: "Could not load series for this venue.", variant: "error" });
          return;
        }
        setSeriesOptions(Array.isArray(body?.series) ? body.series : []);
      } catch {
        setSeriesOptions([]);
        enqueueToast({ title: "Could not load series for this venue.", variant: "error" });
      }
    }
    void loadSeries();
  }, [venueId]);

  const loadTiers = useCallback(async () => {
    const res = await fetch(`/api/my/events/${event.id}/ticket-tiers`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setTiers(Array.isArray(body.tiers) ? body.tiers : []);
  }, [event.id]);

  useEffect(() => {
    if (ticketingMode !== "RSVP" && ticketingMode !== "PAID") return;
    void loadTiers();
  }, [event.id, ticketingMode, loadTiers]);

  useEffect(() => {
    async function loadStripeStatus() {
      if (!venueId || ticketingMode !== "PAID") {
        setStripeConnectActive(false);
        return;
      }
      const res = await fetch(`/api/my/venues/${venueId}/stripe/status`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStripeConnectActive(false);
        return;
      }
      setStripeConnectActive(Boolean(body?.connected && body?.status === "ACTIVE" && body?.chargesEnabled && body?.payoutsEnabled));
    }
    void loadStripeStatus();
  }, [ticketingMode, venueId]);

  async function onCreateSeries() {
    if (!venueId || !newSeriesTitle.trim()) return;
    setIsCreatingSeries(true);
    const res = await fetch("/api/my/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newSeriesTitle, venueId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: body?.error?.message ?? "Failed to create series", variant: "error" });
      setIsCreatingSeries(false);
      return;
    }
    setSeriesOptions((current) => [...current, body].sort((a, b) => a.title.localeCompare(b.title)));
    setSeriesId(body.id);
    setNewSeriesTitle("");
    setIsCreatingSeries(false);
  }

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
        seriesId: seriesId || null,
        startAt: localInputToUtcIso(startAt, event.venueTimezone),
        endAt: endAt ? localInputToUtcIso(endAt, event.venueTimezone) : null,
        ticketUrl: ticketUrl || null,
        description: description || null,
        eventType,
        ticketingMode,
        capacity: ticketingMode === "RSVP" ? (capacity.trim() ? Number(capacity) : null) : null,
        rsvpClosesAt: ticketingMode === "RSVP"
          ? (rsvpClosesAt
              ? localInputToUtcIso(rsvpClosesAt, event.venueTimezone)
              : null)
          : null,
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

  async function addTier() {
    const res = await fetch(`/api/my/events/${event.id}/ticket-tiers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: tierName, capacity: tierCapacity.trim() ? Number(tierCapacity) : null, priceAmount: tierPrice.trim() ? Math.round(Number(tierPrice) * 100) : 0, currency: "GBP", isActive: true }),
    });
    if (!res.ok) return;
    await loadTiers();
    setTierName("");
    setTierCapacity("");
    setTierPrice("");
  }

  async function updateTier(tierId: string, patch: Partial<Tier>) {
    const res = await fetch(`/api/my/events/${event.id}/ticket-tiers/${tierId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    await loadTiers();
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
        <div className="space-y-2">
          <label className="block" id="seriesId">
            <span className="text-sm">Part of a series (optional)</span>
            <select className="w-full rounded border p-2" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} disabled={!venueId}>
              <option value="">Not part of a series</option>
              {seriesOptions.map((series) => <option key={series.id} value={series.id}>{series.title}</option>)}
            </select>
          </label>
          {venueId ? (
            <div className="flex gap-2">
              <input className="w-full rounded border p-2" value={newSeriesTitle} onChange={(e) => setNewSeriesTitle(e.target.value)} placeholder="Create new series title" />
              <Button type="button" variant="outline" onClick={() => void onCreateSeries()} disabled={isCreatingSeries || !newSeriesTitle.trim()}>{isCreatingSeries ? "Creating..." : "Create"}</Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded border p-4">
        <label className="block" id="startAt"><span className="text-sm">Start ({event.venueTimezone})</span><input className="w-full rounded border p-2" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Stored as: {startAt ? localInputToUtcIso(startAt, event.venueTimezone) : "—"} UTC</p></label>
        <label className="block" id="endAt"><span className="text-sm">End ({event.venueTimezone}, optional)</span><input className="w-full rounded border p-2" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Stored as: {endAt ? localInputToUtcIso(endAt, event.venueTimezone) : "—"} UTC</p></label>
      </section>

      <section className="space-y-3 rounded border p-4">
        <label className="block" id="description">
          <span className="text-sm">Description</span>
          <textarea className="w-full rounded border p-2" rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <p className={`mt-1 text-xs ${description.length > 3800 ? (description.length >= 4000 ? "text-red-600" : "text-amber-600") : "text-muted-foreground"}`}>
          {description.length}/4000 characters
        </p>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h3 className="text-sm font-semibold">Ticketing</h3>
        <Tabs value={ticketingMode} onValueChange={(value) => setTicketingMode(value as "EXTERNAL" | "RSVP" | "PAID")}>
          <TabsList>
            <TabsTrigger value="EXTERNAL">External URL</TabsTrigger>
            <TabsTrigger value="RSVP">Free RSVP</TabsTrigger>
            <TabsTrigger value="PAID">Paid tickets</TabsTrigger>
          </TabsList>
        </Tabs>

        {ticketingMode === "EXTERNAL" ? (
          <label className="block" id="ticketUrl"><span className="text-sm">Ticket URL</span><input className="w-full rounded border p-2" type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} /></label>
        ) : (
          <div className="space-y-3">
            {ticketingMode === "RSVP" ? (
              <>
                <label className="block text-sm">Capacity (blank = unlimited)<input className="mt-1 w-full rounded border p-2" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
                <label className="block text-sm">RSVP closes at ({event.venueTimezone})<input className="mt-1 w-full rounded border p-2" type="datetime-local" value={rsvpClosesAt} onChange={(e) => setRsvpClosesAt(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Stored as: {rsvpClosesAt ? localInputToUtcIso(rsvpClosesAt, event.venueTimezone) : "—"} UTC</p></label>
              </>
            ) : (
              <div className="rounded border bg-muted/30 p-3 text-sm">
                {venueId ? (
                  stripeConnectActive ? (
                    <p>Stripe Connect is active for this venue.</p>
                  ) : (
                    <p>
                      Paid ticketing requires Stripe Connect.{" "}
                      <a className="underline" href={`/my/venues/${venueId}`}>Connect Stripe account</a>.
                    </p>
                  )
                ) : (
                  <p>Select a venue to enable paid ticketing.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Requires Stripe Connect on the venue.</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Tiers</p>
              <div className="flex gap-2">
                <input className="w-full rounded border p-2" placeholder="Tier name" value={tierName} onChange={(e) => setTierName(e.target.value)} />
                <input className="w-40 rounded border p-2" placeholder="Capacity" type="number" min={1} value={tierCapacity} onChange={(e) => setTierCapacity(e.target.value)} />
                <input
                  className="w-32 rounded border p-2"
                  placeholder="Price (£)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={tierPrice}
                  onChange={(e) => setTierPrice(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void addTier()} disabled={!tierName.trim()}>Add tier</Button>
              </div>

              <ul className="space-y-2">
                {tiers.map((tier, index) => (
                  <li key={tier.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span>
                      {tier.name}
                      {" · "}
                      {tier.priceAmount > 0 ? `£${(tier.priceAmount / 100).toFixed(2)}` : "Free"}
                      {tier.capacity != null ? ` · cap ${tier.capacity}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void updateTier(tier.id, { isActive: !tier.isActive })}>{tier.isActive ? "Active" : "Inactive"}</Button>
                      <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => void updateTier(tier.id, { sortOrder: Math.max(0, tier.sortOrder - 1) })}>↑</Button>
                      <Button type="button" variant="outline" size="sm" disabled={index === tiers.length - 1} onClick={() => void updateTier(tier.id, { sortOrder: tier.sortOrder + 1 })}>↓</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded border p-4">
        <FeaturedEventImagePanel eventId={event.id} featuredImageUrl={event.featuredAsset?.url ?? null} />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
    </form>
  );
}
