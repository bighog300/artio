export type NearbyView = "list" | "map";

export type NearbyEventItem = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  venueName?: string | null;
  primaryImageUrl?: string | null;
  image?: {
    url: string | null;
    isProcessing?: boolean;
    hasFailure?: boolean;
  };
  tags?: Array<{ name?: string; slug: string }>;
  lat?: number | null;
  lng?: number | null;
  mapLat?: number | null;
  mapLng?: number | null;
  distanceKm?: number | null;
};

export type NearbyVenueItem = {
  id: string;
  slug: string;
  name: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  primaryImageUrl?: string | null;
  distanceKm?: number | null;
};

export type NearbyMapItem = (NearbyEventItem & { kind?: "event" }) | (NearbyVenueItem & { kind?: "venue" });

export type MarkerItem = {
  id: string;
  slug: string;
  kind: "event" | "venue";
  title: string;
  startAt?: string;
  venueName?: string | null;
  city?: string | null;
  lat: number;
  lng: number;
};

export const MAX_MAP_MARKERS = 300;

export function resolveNearbyView(value: string | null | undefined): NearbyView {
  return value === "map" ? "map" : "list";
}

export function getMarkerItems(items: NearbyMapItem[], maxMarkers = MAX_MAP_MARKERS) {
  const mapped = items
    .map<MarkerItem | null>((item) => {
      const kind = item.kind ?? ("title" in item ? "event" : "venue");
      const lat = "mapLat" in item ? (item.mapLat ?? item.lat) : item.lat;
      const lng = "mapLng" in item ? (item.mapLng ?? item.lng) : item.lng;
      if (typeof lat !== "number" || Number.isNaN(lat) || typeof lng !== "number" || Number.isNaN(lng)) return null;
      if (kind === "event" && "title" in item) {
        return {
          id: item.id,
          slug: item.slug,
          kind,
          title: item.title,
          startAt: item.startAt,
          venueName: item.venueName ?? null,
          lat,
          lng,
        };
      }
      if ("name" in item) {
        return {
          id: item.id,
          slug: item.slug,
          kind: "venue",
          title: item.name,
          city: item.city ?? null,
          lat,
          lng,
        };
      }
      return null;
    })
    .filter((item): item is MarkerItem => item != null);

  return {
    markers: mapped.slice(0, maxMarkers),
    omittedCount: Math.max(0, mapped.length - maxMarkers),
  };
}
