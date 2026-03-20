"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventPreviewCard } from "@/components/nearby/event-preview-card";
import { getMarkerItems, MAX_MAP_MARKERS, type MarkerItem, type NearbyMapItem } from "@/lib/nearby-map";

// Fix Leaflet default icon asset paths broken by bundlers
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

type NearbyMapProps = {
  items: NearbyMapItem[];
  lat: string;
  lng: string;
  radiusKm: string;
  days: number;
  onSearchArea: (center: { lat: number; lng: number }) => Promise<void>;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
};

export function NearbyMap({ items, lat, lng, radiusKm, days, onSearchArea, fullscreen = false, onExitFullscreen }: NearbyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusPolygonRef = useRef<L.Polygon | null>(null);
  const [selected, setSelected] = useState<MarkerItem | null>(null);
  const [isSearchingArea, setIsSearchingArea] = useState(false);

  const { markers, omittedCount } = useMemo(() => getMarkerItems(items), [items]);

  const fitToResults = () => {
    const map = mapRef.current;
    if (!map || markers.length === 0) return;
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  };

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      radiusPolygonRef.current?.remove();
      radiusPolygonRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    markers.forEach((markerItem) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = markerItem.kind === "event"
        ? "h-3 w-3 rounded-full border border-gray-900 bg-blue-500"
        : "h-3 w-3 rounded-full border border-gray-900 bg-emerald-500";
      el.setAttribute("aria-label", `Show ${markerItem.title}`);
      el.addEventListener("click", () => setSelected(markerItem));

      const icon = L.divIcon({ html: el, className: "", iconSize: [12, 12], iconAnchor: [6, 6] });
      const marker = L.marker([markerItem.lat, markerItem.lng], { icon }).addTo(map);
      markerRefs.current.push(marker);
    });
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length === 0) return;
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [days, markers, radiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    const numericLat = Number.parseFloat(lat);
    const numericLng = Number.parseFloat(lng);
    const numericRadius = Number.parseFloat(radiusKm);
    if (!map || !Number.isFinite(numericLat) || !Number.isFinite(numericLng) || !Number.isFinite(numericRadius)) return;

    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "h-3 w-3 rounded-full border-2 border-white bg-black shadow";
    const icon = L.divIcon({ html: el, className: "", iconSize: [12, 12], iconAnchor: [6, 6] });
    userMarkerRef.current = L.marker([numericLat, numericLng], { icon }).addTo(map);

    const circle = createCircle([numericLng, numericLat], numericRadius, 64);
    const latLngs = circle.geometry.coordinates[0].map(([circleLng, circleLat]) => [circleLat, circleLng] as [number, number]);

    if (radiusPolygonRef.current) {
      radiusPolygonRef.current.setLatLngs(latLngs);
    } else {
      radiusPolygonRef.current = L.polygon(latLngs, {
        color: "#2563eb",
        weight: 1.5,
        fillColor: "#2563eb",
        fillOpacity: 0.08,
      }).addTo(map);
    }
  }, [lat, lng, radiusKm]);

  if (markers.length === 0) {
    return <p className="text-sm text-gray-600">No events or venues found in this area. Increase radius or try another area.</p>;
  }

  const wrapperClassName = fullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-background"
    : "space-y-3";

  const mapContainerClassName = fullscreen
    ? "flex-1 w-full"
    : "h-[420px] w-full rounded border md:h-[calc(100vh-220px)] md:min-h-[500px] md:max-h-[800px]";

  const searchArea = async () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    setIsSearchingArea(true);
    try {
      await onSearchArea({ lat: center.lat, lng: center.lng });
    } finally {
      setIsSearchingArea(false);
    }
  };

  return (
    <div className={wrapperClassName}>
      {fullscreen ? (
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground"
            onClick={onExitFullscreen}
            aria-label="Back to list"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Event
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Venue
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Event marker</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Venue marker</span>
          <span>Showing up to {MAX_MAP_MARKERS} results.</span>
        </div>
      )}
      {!fullscreen && omittedCount > 0 ? <p className="text-xs text-amber-700">{omittedCount} additional markers omitted. Reduce radius/days to see more.</p> : null}
      <div
        ref={mapContainerRef}
        className={mapContainerClassName}
        aria-label="Nearby map"
      />
      {fullscreen ? (
        <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
          <button className="rounded border px-3 py-1 text-sm" type="button" onClick={fitToResults}>
            Center on results
          </button>
          <button
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            type="button"
            onClick={() => void searchArea()}
            disabled={isSearchingArea}
          >
            {isSearchingArea ? "Searching area..." : "Search this area"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="rounded border px-3 py-1 text-sm" type="button" onClick={fitToResults}>Center on results</button>
          <button
            className="rounded border px-3 py-1 text-sm"
            type="button"
            onClick={() => void searchArea()}
            disabled={isSearchingArea}
          >
            {isSearchingArea ? "Searching area..." : "Search this area"}
          </button>
        </div>
      )}
      {selected ? (
        <>
          <div className="hidden md:block"><EventPreviewCard event={selected} /></div>
          <div className={`fixed inset-x-0 border-t bg-card p-3 shadow-lg md:hidden ${fullscreen ? "bottom-12 z-[60]" : "bottom-16 z-20"}`}><EventPreviewCard event={selected} /></div>
        </>
      ) : <p className="text-xs text-gray-600">Select a marker to preview.</p>}
    </div>
  );
}

function createCircle(center: [number, number], radiusKm: number, points: number) {
  const [lng, lat] = center;
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  const coordinates: number[][] = [];
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const dLat = (radiusKm / kmPerDegreeLat) * Math.sin(angle);
    const dLng = (radiusKm / kmPerDegreeLng) * Math.cos(angle);
    coordinates.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}
