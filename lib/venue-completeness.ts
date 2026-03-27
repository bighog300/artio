export type VenueCompletenessFlag =
  | "MISSING_IMAGE"
  | "MISSING_DESCRIPTION"
  | "INCOMPLETE";

export type VenueCompletenessResult = {
  score: number;
  scorePct: number;
  missing: string[];
  flags: VenueCompletenessFlag[];
};

export function computeVenueCompleteness(venue: {
  description: string | null;
  featuredAssetId: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  openingHours: unknown;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
}): VenueCompletenessResult {
  const checksTotal = 8;
  let checksPassed = 0;

  const descriptionLength = (venue.description ?? "").trim().length;
  if (descriptionLength >= 50) {
    checksPassed += 1;
  }

  if (venue.featuredAssetId) {
    checksPassed += 1;
  }

  if ((venue.websiteUrl ?? "").trim()) {
    checksPassed += 1;
  }

  if ((venue.contactEmail ?? "").trim()) {
    checksPassed += 1;
  }

  const openingHoursSerialized = JSON.stringify(venue.openingHours);
  const hasOpeningHours =
    venue.openingHours !== null
    && openingHoursSerialized !== "{}"
    && openingHoursSerialized !== "[]"
    && openingHoursSerialized !== "null";
  if (hasOpeningHours) {
    checksPassed += 1;
  }

  if ((venue.addressLine1 ?? "").trim()) {
    checksPassed += 1;
  }

  if ((venue.city ?? "").trim()) {
    checksPassed += 1;
  }

  if ((venue.country ?? "").trim()) {
    checksPassed += 1;
  }

  const scorePct = Math.round((checksPassed / checksTotal) * 100);
  const flags: VenueCompletenessFlag[] = [];

  if (!venue.featuredAssetId) flags.push("MISSING_IMAGE");
  if (descriptionLength < 50) flags.push("MISSING_DESCRIPTION");
  if (scorePct < 60) flags.push("INCOMPLETE");

  const missing: string[] = [];
  if (descriptionLength < 50) missing.push("description");
  if (!venue.featuredAssetId) missing.push("image");
  if (!(venue.websiteUrl ?? "").trim()) missing.push("website");
  if (!(venue.contactEmail ?? "").trim()) missing.push("contact email");
  if (!hasOpeningHours) missing.push("opening hours");
  if (!(venue.addressLine1 ?? "").trim()) missing.push("address");
  if (!(venue.city ?? "").trim()) missing.push("city");
  if (!(venue.country ?? "").trim()) missing.push("country");

  return { score: scorePct, scorePct, missing, flags };
}
