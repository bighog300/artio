"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LocationPreferencesForm } from "@/components/location/location-preferences-form";
import { NearbyMap } from "@/components/nearby/nearby-map";
import { ErrorCard } from "@/components/ui/error-card";
import { resolveNearbyView, type NearbyEventItem, type NearbyVenueItem, type NearbyView } from "@/lib/nearby-map";
import { SaveSearchButton } from "@/components/saved-searches/save-search-button";
import { trackEngagement } from "@/lib/engagement-client";
import { track } from "@/lib/analytics/client";
import { EventCard } from "@/components/events/event-card";
import { EventRailCard } from "@/components/events/event-rail-card";
import { EventsFiltersBar } from "@/components/events/events-filters-bar";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { parseNearbyFilters } from "@/lib/nearby-filters";
import { fetchNearbyEvents, fetchNearbyVenues, normalizeNearbyNumber } from "@/lib/nearby-client-fetch";
import { VenueCard } from "@/components/venues/venue-card";

const VIEW_STORAGE_KEY = "nearby:view";

type LocationDraft = { locationLabel: string; lat: string; lng: string; radiusKm: string };

function safeRadiusKm(value: string, fallback = "25") {
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 ? String(radius) : fallback;
}

function toKmLabel(item: { distanceKm?: number | null }) {
  if (typeof item.distanceKm !== "number") return undefined;
  return `${item.distanceKm.toFixed(1)} km`;
}

export function NearbyClient({ initialLocation, isAuthenticated, initialView }: { initialLocation: LocationDraft; isAuthenticated: boolean; initialView: NearbyView }) {
  const [form, setForm] = useState<LocationDraft>(initialLocation);
  const [eventItems, setEventItems] = useState<NearbyEventItem[]>([]);
  const [venueItems, setVenueItems] = useState<NearbyVenueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [view, setView] = useState<NearbyView>(initialView);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewedImpressionKeys = useRef<Set<string>>(new Set());
  const searchParamsKey = searchParams?.toString() ?? "";
  const filters = useMemo(() => parseNearbyFilters(searchParams), [searchParamsKey]);
  const tagsKey = useMemo(() => filters.tags.join(","), [filters.tags]);
  const selectedTags = useMemo(() => (tagsKey ? tagsKey.split(",") : []), [tagsKey]);
  const canSearch = useMemo(() => form.lat.trim() !== "" && form.lng.trim() !== "", [form.lat, form.lng]);

  const updateView = useCallback((nextView: NearbyView) => {
    setView(nextView);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", nextView);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadNearby = useCallback(async ({ mode = "reset", cursor, override }: { mode?: "reset" | "append"; cursor?: string | null; override?: { lat: string; lng: string } } = {}) => {
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
      const [eventsResult, venuesResult] = await Promise.all([
        fetchNearbyEvents<{ items: NearbyEventItem[]; nextCursor: string | null }>({
          lat: targetLat,
          lng: targetLng,
          radiusKm: radiusNum,
          cursor,
          filters: { sort: filters.sort, q: filters.q, tags: selectedTags, from: filters.from, to: filters.to, days: filters.days },
        }),
        fetchNearbyVenues<{ items: NearbyVenueItem[]; nextCursor: string | null }>({
          lat: targetLat,
          lng: targetLng,
          radiusKm: radiusNum,
          filters: { sort: filters.sort, q: filters.q, tags: selectedTags, from: filters.from, to: filters.to, days: filters.days },
        }),
      ]);

      if (!eventsResult.ok || !venuesResult.ok) {
        const nextError = !eventsResult.ok ? eventsResult.error : (!venuesResult.ok ? venuesResult.error : "Unable to load nearby results.");
        setMessage(nextError);
        if (mode !== "append") {
          setEventItems([]);
          setVenueItems([]);
        }
        setNextCursor(null);
        return;
      }

      const eventData = eventsResult.data;
      setEventItems((prev) => mode === "append" ? [...prev, ...eventData.items.filter((item) => !prev.some((existing) => existing.id === item.id))] : eventData.items);
      if (mode !== "append") setVenueItems(venuesResult.data.items);
      setNextCursor(eventData.nextCursor);
    } catch {
      setMessage("Unable to load nearby results.");
      if (mode !== "append") {
        setEventItems([]);
        setVenueItems([]);
      }
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters.days, filters.from, filters.q, filters.sort, filters.to, form.lat, form.lng, form.radiusKm, selectedTags]);

  useEffect(() => {
    if (searchParams?.get("view")) return;
    if (typeof window === "undefined") return;
    const stored = resolveNearbyView(window.localStorage.getItem(VIEW_STORAGE_KEY));
    if (stored !== view) updateView(stored);
  }, [searchParams, updateView, view]);

  useEffect(() => { if (canSearch) void loadNearby({ mode: "reset" }); }, [canSearch, loadNearby]);

  useEffect(() => {
    track("events_list_viewed", { source: "nearby", hasLocation: canSearch });
    if (!canSearch) track("location_education_shown", { page: "nearby" });
  }, [canSearch]);

  useEffect(() => {
    const visible = eventItems.slice(0, 10);
    for (const [index, item] of visible.entries()) {
      const key = `${item.id}:${index}`;
      if (viewedImpressionKeys.current.has(key)) continue;
      viewedImpressionKeys.current.add(key);
      trackEngagement({ surface: "NEARBY", action: "VIEW", targetType: "EVENT", targetId: item.id, meta: { position: index } });
    }
  }, [eventItems]);

  useEffect(() => {
    if (mapFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mapFullscreen]);


  const enableLocation = async () => {
    track("location_enable_clicked", { page: "nearby" });
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      track("location_enable_result", { result: "error" });
      setMessage("Location is unavailable in this browser.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const nextLat = String(position.coords.latitude);
        const nextLng = String(position.coords.longitude);
        const nextLabel = form.locationLabel.trim() || "Current location";
        setForm((prev) => ({ ...prev, lat: nextLat, lng: nextLng, locationLabel: nextLabel, radiusKm: safeRadiusKm(prev.radiusKm) }));
        if (isAuthenticated) {
          await fetch("/api/me/location", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ locationLabel: nextLabel, lat: position.coords.latitude, lng: position.coords.longitude, radiusKm: Number(form.radiusKm || "25") }),
          });
        }
        await loadNearby({ mode: "reset", override: { lat: nextLat, lng: nextLng } });
        track("location_enable_result", { result: "granted" });
      } finally {
        setIsLocating(false);
      }
    }, (error) => {
      track("location_enable_result", { result: "denied" });
      if (error.code === error.PERMISSION_DENIED) {
        setMessage("Location permission denied. Search for a place instead.");
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        setMessage("Location unavailable. Try again or search for a place.");
      } else if (error.code === error.TIMEOUT) {
        setMessage("Location request timed out. Try again.");
      } else {
        setMessage("Unable to access your location. Search for a place instead.");
      }
      setIsLocating(false);
    }, { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false });
  };

  const mapItems = useMemo(() => [
    ...eventItems.map((item) => ({ ...item, kind: "event" as const })),
    ...venueItems.map((item) => ({ ...item, kind: "venue" as const })),
  ], [eventItems, venueItems]);

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
        <div className="mt-3 rounded-md border p-3">
          <p className="text-sm text-muted-foreground">Use your device location for faster nearby results.</p>
          <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void enableLocation()} disabled={isLocating}>
            {isLocating ? "Locating..." : "Use my current location"}
          </button>
        </div>
        {isAuthenticated && canSearch ? <div className="mt-3"><SaveSearchButton type="NEARBY" params={{ lat: Number(form.lat), lng: Number(form.lng), radiusKm: Number(form.radiusKm || "25"), q: filters.q || undefined, tags: filters.tags, days: filters.from || filters.to ? undefined : filters.days, from: filters.from || undefined, to: filters.to || undefined, sort: filters.sort, view }} defaultName={`Nearby: ${form.locationLabel || "Current location"} (${form.radiusKm || "25"}km)`} /></div> : null}
      </div>

      <EventsFiltersBar defaultSort="soonest" queryParamName="q" sortOptions={["soonest", "distance"]} dayOptions={[7, 30, 90]} />
      {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}

      <div className="inline-flex rounded-md border border-border p-1" role="tablist" aria-label="Nearby view mode">
        <button
          className={`rounded px-3 py-1 text-sm ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => {
            updateView("list");
            setMapFullscreen(false);
          }}
          type="button"
          role="tab"
          aria-selected={view === "list"}
        >
          List
        </button>
        <button
          className={`rounded px-3 py-1 text-sm ${view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => {
            updateView("map");
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
              setMapFullscreen(true);
            }
          }}
          type="button"
          role="tab"
          aria-selected={view === "map"}
        >
          Map
        </button>
      </div>

      {message ? <ErrorCard message={message} onRetry={() => void loadNearby({ mode: "reset" })} /> : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <EventCardSkeleton key={index} />)}
        </div>
      ) : null}

      {view === "map" && !isLoading ? (
        <NearbyMap
          items={mapItems}
          lat={form.lat}
          lng={form.lng}
          radiusKm={form.radiusKm}
          days={filters.days}
          fullscreen={mapFullscreen}
          onExitFullscreen={() => {
            setMapFullscreen(false);
            updateView("list");
          }}
          onSearchArea={async (center) => {
            const nextLat = String(center.lat);
            const nextLng = String(center.lng);
            setForm((prev) => ({ ...prev, lat: nextLat, lng: nextLng }));
            await loadNearby({ mode: "reset", override: { lat: nextLat, lng: nextLng } });
          }}
        />
      ) : null}

      {view === "list" && !isLoading ? (
        eventItems.length === 0 && venueItems.length === 0 ? (
          canSearch ? (
            <EmptyState
              title="No events found nearby"
              description="Try expanding your search radius or check back soon."
              actions={[{ label: "Browse all events", href: "/events" }]}
            />
          ) : (
            <EmptyState
              title="Set your location to see nearby events"
              description="We'll show events happening close to you."
              actions={[{ label: "Set location", href: "/account#location" }]}
            />
          )
        ) : (
          <>
            {eventItems.length > 0 ? (
              <>
                <section className="space-y-3">
                  <h2 className="text-lg font-semibold tracking-tight">Near-term picks</h2>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {eventItems.slice(0, 6).map((item) => (
                      <div key={`rail-${item.id}`} onClick={() => { trackEngagement({ surface: "NEARBY", action: "CLICK", targetType: "EVENT", targetId: item.id }); track("event_viewed", { eventSlug: item.slug, source: "nearby", ui: "rail" }); }}>
                        <EventRailCard href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} image={item.image} imageUrl={item.primaryImageUrl} distanceLabel={toKmLabel(item)} />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {eventItems.map((item, idx) => (
                    <div key={item.id} onClick={() => { trackEngagement({ surface: "NEARBY", action: "CLICK", targetType: "EVENT", targetId: item.id, meta: { position: idx } }); track("event_viewed", { eventSlug: item.slug, source: "nearby", ui: "card" }); }}>
                      <EventCard href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} image={item.image} imageUrl={item.primaryImageUrl} distanceLabel={toKmLabel(item)} badges={(item.tags ?? []).map((tag) => tag.slug)} />
                    </div>
                  ))}
                </section>
                {nextCursor ? <div className="pt-2"><button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void loadNearby({ mode: "append", cursor: nextCursor })} disabled={isLoading}>{isLoading ? "Loading..." : "Load more"}</button></div> : null}
              </>
            ) : null}

            {venueItems.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Nearby venues</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {venueItems.map((item) => <VenueCard key={item.id} venue={item} />)}
                </div>
              </section>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
