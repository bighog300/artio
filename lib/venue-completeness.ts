export type VenueCompletenessInput = {
  lat: number | null;
  lng: number | null;
  description: string | null;
  openingHours: unknown;
  contactEmail: string | null;
  instagramUrl: string | null;
  featuredAssetId: string | null;
  eventsPageUrl: string | null;
};

const FIELDS: Array<{
  key: keyof VenueCompletenessInput;
  label: string;
}> = [
  { key: "lat", label: "Coordinates" },
  { key: "description", label: "Description" },
  { key: "openingHours", label: "Opening hours" },
  { key: "contactEmail", label: "Contact email" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "featuredAssetId", label: "Cover image" },
  { key: "eventsPageUrl", label: "Events page URL" },
];

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length > 0;
  }
  return Boolean(value);
}

export function computeVenueCompleteness(venue: VenueCompletenessInput): {
  score: number;
  missing: string[];
} {
  const missing: string[] = [];
  let present = 0;

  for (const field of FIELDS) {
    if (isPresent(venue[field.key])) {
      present += 1;
    } else {
      missing.push(field.label);
    }
  }

  return {
    score: Math.round((present / FIELDS.length) * 100),
    missing,
  };
}
