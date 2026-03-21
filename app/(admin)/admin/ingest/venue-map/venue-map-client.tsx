"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Fix Leaflet default icon paths
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

type VenueMapVenue = {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  websiteUrl: string | null;
  eventsPageUrl: string | null;
};

type VenueStatus = {
  lastRunAt: string;
  lastRunStatus: string;
  pendingCount: number;
};

function pinColor(status: VenueStatus | undefined): string {
  if (!status || status.lastRunStatus === "NEVER") return "#9ca3af";
  if (status.lastRunStatus === "FAILED") return "#ef4444";
  if (status.pendingCount > 0) return "#f59e0b";
  return "#22c55e";
}

function relativeTime(iso: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)}hr ago`;
  return `${Math.round(abs / 86_400_000)}d ago`;
}

export function VenueMapClient({ venues }: { venues: VenueMapVenue[] }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<L.Marker[]>([]);

  const [statusMap, setStatusMap] = useState<Record<string, VenueStatus>>({});
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [selected, setSelected] = useState<VenueMapVenue | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ venueId: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/venues/ingest-status")
      .then((r) => r.json())
      .then((data: { status: Record<string, VenueStatus> }) => {
        setStatusMap(data.status);
      })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([51.5, -0.1], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    venues.forEach((venue) => {
      const status = statusMap[venue.id];
      const color = pinColor(status);

      const el = document.createElement("button");
      el.type = "button";
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer;`;
      el.setAttribute("aria-label", venue.name);
      el.addEventListener("click", () => setSelected(venue));

      const icon = L.divIcon({ html: el, className: "", iconSize: [14, 14], iconAnchor: [7, 7] });
      const marker = L.marker([venue.lat, venue.lng], { icon }).addTo(map);
      markerRefs.current.push(marker);
    });

    if (venues.length > 0) {
      const bounds = L.latLngBounds(venues.map((v) => [v.lat, v.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [venues, statusMap]);

  async function triggerRun(venue: VenueMapVenue) {
    setRunning(venue.id);
    setRunResult(null);
    try {
      const res = await fetch(`/api/admin/ingest/venues/${venue.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setRunResult({ venueId: venue.id, ok: res.ok });
      if (res.ok) {
        const fresh = await fetch("/api/admin/venues/ingest-status");
        if (fresh.ok) {
          const data = (await fresh.json()) as { status: Record<string, VenueStatus> };
          setStatusMap(data.status);
        }
      }
    } catch {
      setRunResult({ venueId: venue.id, ok: false });
    } finally {
      setRunning(null);
    }
  }

  const selectedStatus = selected ? statusMap[selected.id] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {[
          { color: "#22c55e", label: "Last run succeeded" },
          { color: "#f59e0b", label: "Has pending candidates" },
          { color: "#ef4444", label: "Last run failed" },
          { color: "#9ca3af", label: "Never run" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full border-2 border-white shadow-sm"
              style={{ width: 12, height: 12, background: color }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto">{loadingStatus ? "Loading status…" : `${venues.length} venues`}</span>
      </div>

      <div className="flex gap-4">
        <div
          ref={mapContainerRef}
          className="h-[560px] flex-1 rounded border"
          aria-label="Venue ingest map"
        />

        {selected ? (
          <div className="w-64 shrink-0 space-y-3 rounded border bg-background p-4 text-sm">
            <div>
              <p className="font-semibold">{selected.name}</p>
              {selected.city ? <p className="text-xs text-muted-foreground">{selected.city}</p> : null}
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block rounded-full border-2 border-white shadow-sm"
                  style={{
                    width: 10,
                    height: 10,
                    background: pinColor(selectedStatus),
                  }}
                />
                <span className="text-muted-foreground">
                  {selectedStatus?.lastRunStatus === "NEVER"
                    ? "Never run"
                    : selectedStatus?.lastRunStatus === "FAILED"
                      ? `Failed ${relativeTime(selectedStatus.lastRunAt)}`
                      : selectedStatus?.lastRunAt
                        ? `Ran ${relativeTime(selectedStatus.lastRunAt)}`
                        : "No runs yet"}
                </span>
              </div>
              {selectedStatus?.pendingCount ? (
                <p className="text-amber-700">
                  {selectedStatus.pendingCount} pending candidate
                  {selectedStatus.pendingCount === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                disabled={running === selected.id}
                onClick={() => void triggerRun(selected)}
              >
                {running === selected.id ? "Running…" : "Run extraction"}
              </button>

              {runResult?.venueId === selected.id ? (
                <p className={`text-xs ${runResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {runResult.ok ? "Run started — check Runs tab for results." : "Run failed to start."}
                </p>
              ) : null}

              {selected.eventsPageUrl ? (
                <p className="truncate text-xs text-muted-foreground" title={selected.eventsPageUrl}>
                  Events: {selected.eventsPageUrl}
                </p>
              ) : selected.websiteUrl ? (
                <p className="truncate text-xs text-muted-foreground" title={selected.websiteUrl}>
                  Site: {selected.websiteUrl}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Link
                  href={`/admin/venues/${selected.id}`}
                  className="text-xs text-muted-foreground underline"
                >
                  Edit venue
                </Link>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-64 shrink-0 items-center justify-center rounded border bg-background p-4">
            <p className="text-center text-xs text-muted-foreground">
              Click a venue pin to see status and trigger a run.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
