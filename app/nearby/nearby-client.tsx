"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LocationPreferencesForm } from "@/components/location/location-preferences-form";
import { NearbyMap } from "@/components/nearby/nearby-map";
import { ErrorCard } from "@/components/ui/error-card";
import { resolveNearbyView, type NearbyEventItem, type NearbyView } from "@/lib/nearby-map";
import { SaveSearchButton } from "@/components/saved-searches/save-search-button";
import { trackEngagement } from "@/lib/engagement-client";
import { track } from "@/lib/analytics/client";
import { EventCard } from "@/components/events/event-card";
import { EventRailCard } from "@/components/events/event-rail-card";
import { EventsFiltersBar } from "@/components/events/events-filters-bar";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { parseNearbyFilters } from "@/lib/nearby-filters";
import { fetchNearbyEvents, normalizeNearbyNumber } from "@/lib/nearby-client-fetch";

const VIEW_STORAGE_KEY = "nearby:view";

type LocationDraft = { locationLabel: string; lat: string; lng: string; radiusKm: string };

function safeRadiusKm(value: string, fallback = "25") {
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 ? String(radius) : fallback;
}

function toKmLabel(userLat: string, userLng: string, event: NearbyEventItem) {
  const lat1 = Number(userLat);
  const lng1 = Number(userLng);
  const lat2 = event.mapLat ?? event.lat;
  const lng2 = event.mapLng ?? event.lng;
  if (Number.isNaN(lat1) || Number.isNaN(lng1) || lat2 == null || lng2 == null) return undefined;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return `${(6371 * c).toFixed(1)} km`;
}

export function NearbyClient({ initialLocation, isAuthenticated, initialView }: { initialLocation: LocationDraft; isAuthenticated: boolean; initialView: NearbyView }) {
  const [form, setForm] = useState<LocationDraft>(initialLocation);
  const [items, setItems] = useState<NearbyEventItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [view, setView] = useState<NearbyView>(initialView);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewedImpressionKeys = useRef<Set<string>>(new Set());
  const filters = useMemo(() => parseNearbyFilters(searchParams), [searchParams]);
  const canSearch = useMemo(() => form.lat.trim() !== "" && form.lng.trim() !== "", [form.lat, form.lng]);

  const updateView = useCallback((nextView: NearbyView) => {
    setView(nextView);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", nextView);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadEvents = useCallback(async ({ mode = "reset", cursor, override }: { mode?: "reset" | "append"; cursor?: string | null; override?: { lat: string; lng: string } } = {}) => {
    const targetLat = override?.lat ?? form.lat;
    const targetLng = override?.lng ?? form.lng;
    const radiusNum = normalizeNearbyNumber(form.radiusKm || "25");
    if (!targetLat.trim() || !targetLng.trim() || !Number.isFinite(radiusNum) || radiusNum <= 0) {
      setInlineError("Choose a location and radius to search nearby");
      return;
    }
    setInlineError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const result = await fetchNearbyEvents<{ items: NearbyEventItem[]; nextCursor: string | null }>({
        lat: targetLat,
        lng: targetLng,
        radiusKm: radiusNum,
        cursor,
        filters: { sort: filters.sort, q: filters.q, tags: filters.tags, from: filters.from, to: filters.to, days: filters.days },
      });
      if (!result.ok) {
        setMessage(result.error);
        if (mode !== "append") setItems([]);
        setNextCursor(null);
        return;
      }
      const data = result.data;
      setItems((prev) => mode === "append" ? [...prev, ...data.items.filter((item) => !prev.some((existing) => existing.id === item.id))] : data.items);
      setNextCursor(data.nextCursor);
    } catch {
      setMessage("Unable to load nearby events.");
      if (mode !== "append") setItems([]);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters.days, filters.from, filters.q, filters.sort, filters.tags, filters.to, form.lat, form.lng, form.radiusKm]);

  useEffect(() => {
    if (searchParams?.get("view")) return;
    if (typeof window === "undefined") return;
    const stored = resolveNearbyView(window.localStorage.getItem(VIEW_STORAGE_KEY));
    if (stored !== view) updateView(stored);
  }, [searchParams, updateView, view]);

  useEffect(() => { if (canSearch) void loadEvents({ mode: "reset" }); }, [canSearch, loadEvents]);

  useEffect(() => {
    track("events_list_viewed", { source: "nearby", hasLocation: canSearch });
    if (!canSearch) track("location_education_shown", { page: "nearby" });
  }, [canSearch]);

  useEffect(() => {
    const visible = items.slice(0, 10);
    for (const [index, item] of visible.entries()) {
      const key = `${item.id}:${index}`;
      if (viewedImpressionKeys.current.has(key)) continue;
      viewedImpressionKeys.current.add(key);
      trackEngagement({ surface: "NEARBY", action: "VIEW", targetType: "EVENT", targetId: item.id, meta: { position: index } });
    }
  }, [items]);

  const tags = useMemo(() => Array.from(new Set(items.flatMap((item) => (item.tags ?? []).map((tag) => tag.slug)))), [items]);

  const enableLocation = async () => {
    track("location_enable_clicked", { page: "nearby" });
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      track("location_enable_result", { result: "error" });
      setMessage("Location is unavailable in this browser.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const nextLat = String(position.coords.latitude);
      const nextLng = String(position.coords.longitude);
      const nextLabel = form.locationLabel.trim() || "Current location";
      const nextForm = { ...form, lat: nextLat, lng: nextLng, locationLabel: nextLabel, radiusKm: safeRadiusKm(form.radiusKm) };
      setForm(nextForm);
      if (isAuthenticated) {
        await fetch("/api/me/location", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locationLabel: nextLabel, lat: position.coords.latitude, lng: position.coords.longitude, radiusKm: Number(form.radiusKm || "25") }),
        });
      }
      track("location_enable_result", { result: "granted" });
      setIsLocating(false);
    }, () => {
      track("location_enable_result", { result: "denied" });
      setMessage("Location permission was denied.");
      setIsLocating(false);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <LocationPreferencesForm
          initial={initialLocation}
          saveButtonLabel={isAuthenticated ? "Save location" : "Use this location"}
          onSave={async (payload) => {
            setForm({ locationLabel: payload.locationLabel ?? "", lat: payload.lat == null ? "" : String(payload.lat), lng: payload.lng == null ? "" : String(payload.lng), radiusKm: safeRadiusKm(String(payload.radiusKm)) });
            if (!isAuthenticated) return true;
            const response = await fetch("/api/me/location", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
            return response.ok;
          }}
          afterSave={(next) => setForm((prev) => ({ ...prev, ...next, radiusKm: safeRadiusKm(next.radiusKm) }))}
        />
        {isAuthenticated && canSearch ? <div className="mt-3"><SaveSearchButton type="NEARBY" params={{ lat: Number(form.lat), lng: Number(form.lng), radiusKm: Number(form.radiusKm || "25"), q: filters.q || undefined, tags: filters.tags, days: filters.from || filters.to ? undefined : filters.days, from: filters.from || undefined, to: filters.to || undefined, sort: filters.sort, view }} defaultName={`Nearby: ${form.locationLabel || "Current location"} (${form.radiusKm || "25"}km)`} /></div> : null}
      </div>

      <EventsFiltersBar availableTags={tags} defaultSort="soonest" queryParamName="q" sortOptions={["soonest", "distance"]} dayOptions={[7, 30, 90]} />
      {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}

      <div className="inline-flex rounded-md border border-border p-1" role="tablist" aria-label="Nearby view mode">
        <button className={`rounded px-3 py-1 text-sm ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => updateView("list")} type="button" role="tab" aria-selected={view === "list"}>List</button>
        <button className={`rounded px-3 py-1 text-sm ${view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => updateView("map")} type="button" role="tab" aria-selected={view === "map"}>Map</button>
      </div>

      {message ? <ErrorCard message={message} onRetry={() => void loadEvents({ mode: "reset" })} /> : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <EventCardSkeleton key={index} />)}
        </div>
      ) : null}

      {view === "map" && !isLoading ? <NearbyMap events={items} lat={form.lat} lng={form.lng} radiusKm={form.radiusKm} days={filters.days} onSearchArea={async (center) => { const nextLat = String(center.lat); const nextLng = String(center.lng); setForm((prev) => ({ ...prev, lat: nextLat, lng: nextLng })); await loadEvents({ mode: "reset", override: { lat: nextLat, lng: nextLng } }); }} /> : null}

      {view === "list" && !isLoading ? (
        items.length === 0 ? (
          canSearch ? (
            <EmptyState
              title="No nearby events found"
              description="Increase your radius, or try another area to discover events."
              actions={[{ label: isAuthenticated ? "Manage location" : "Sign in", href: isAuthenticated ? "/account" : "/login", variant: "secondary" }]}
            />
          ) : (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Enable location</h3>
              <p className="mt-1 text-sm text-muted-foreground">Nearby uses your device location to compute distance.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void enableLocation()} disabled={isLocating}>{isLocating ? "Enabling..." : "Enable location"}</button>
                <Link href="/events" className="rounded border px-3 py-1 text-sm">Browse all events</Link>
              </div>
            </div>
          )
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Near-term picks</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {items.slice(0, 6).map((item) => (
                  <div key={`rail-${item.id}`} onClick={() => { trackEngagement({ surface: "NEARBY", action: "CLICK", targetType: "EVENT", targetId: item.id }); track("event_viewed", { eventSlug: item.slug, source: "nearby", ui: "rail" }); }}>
                    <EventRailCard href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} imageUrl={item.primaryImageUrl} distanceLabel={toKmLabel(form.lat, form.lng, item)} />
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, idx) => (
                <div key={item.id} onClick={() => { trackEngagement({ surface: "NEARBY", action: "CLICK", targetType: "EVENT", targetId: item.id, meta: { position: idx } }); track("event_viewed", { eventSlug: item.slug, source: "nearby", ui: "card" }); }}>
                  <EventCard href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} imageUrl={item.primaryImageUrl} distanceLabel={toKmLabel(form.lat, form.lng, item)} badges={(item.tags ?? []).map((tag) => tag.slug)} />
                </div>
              ))}
            </section>
            {nextCursor ? <div className="pt-2"><button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void loadEvents({ mode: "append", cursor: nextCursor })} disabled={isLoading}>{isLoading ? "Loading..." : "Load more"}</button></div> : null}
          </>
        )
      ) : null}
    </div>
  );
}
