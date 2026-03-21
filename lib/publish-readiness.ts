export type CheckItem = {
  id: string;
  label: string;
  severity: "block" | "warn" | "info";
  href?: string;
};

export type ReadinessResult = {
  ready: boolean;
  blocking: CheckItem[];
  warnings: CheckItem[];
};

export type PublishBlocker = {
  id: string;
  message: string;
};

export type PublishReadiness = {
  ready: boolean;
  blockers: string[];
};

export type CompletenessItem = {
  id: string;
  label: string;
  done: boolean;
  href?: string;
};

export type ArtistCompletenessResult = {
  score: number;
  required: CompletenessItem[];
  recommended: CompletenessItem[];
  canGoLive: boolean;
};

const hasText = (value: string | null | undefined, min = 1) => (value ?? "").trim().length >= min;

export function evaluateArtistReadiness(artist: { name: string | null; bio: string | null; featuredAssetId: string | null; featuredImageUrl?: string | null; avatarImageUrl?: string | null; websiteUrl?: string | null }): ReadinessResult {
  const blocking: CheckItem[] = [];
  const warnings: CheckItem[] = [];

  if (!hasText(artist.name)) blocking.push({ id: "artist-name", label: "Add artist name.", severity: "block", href: "#name" });
  if (!hasText(artist.bio, 20)) blocking.push({ id: "artist-bio", label: "Add bio (20+ characters).", severity: "block", href: "#bio" });
  const hasAnyImage = Boolean(
    artist.featuredAssetId ||
    artist.featuredImageUrl?.trim() ||
    artist.avatarImageUrl?.trim()
  );
  if (!hasAnyImage) warnings.push({ id: "artist-avatar", label: "Add a profile image (recommended).", severity: "info", href: "#avatar" });
  if (!hasText(artist.websiteUrl)) warnings.push({ id: "artist-website", label: "Add website URL (recommended).", severity: "info", href: "#websiteUrl" });

  return { ready: blocking.length === 0, blocking, warnings };
}

export function evaluateArtistCompleteness(
  artist: {
    name: string | null;
    bio: string | null;
    mediums: string[];
    websiteUrl: string | null;
    instagramUrl: string | null;
    featuredAssetId: string | null;
    images: Array<{ id: string }>;
    nationality?: string | null;
    birthYear?: number | null;
  },
  publishedArtworkCount: number,
): ArtistCompletenessResult {
  const required: CompletenessItem[] = [
    {
      id: "name",
      label: "Add your name",
      done: Boolean(artist.name?.trim()),
      href: "#name",
    },
    {
      id: "bio",
      label: "Write a bio (50+ characters)",
      done: (artist.bio?.trim().length ?? 0) >= 50,
      href: "#bio",
    },
    {
      id: "image",
      label: "Add a profile photo",
      done: Boolean(artist.featuredAssetId) || artist.images.length > 0,
      href: "#images",
    },
    {
      id: "artwork",
      label: "Publish at least one artwork",
      done: publishedArtworkCount > 0,
      href: "#artworks",
    },
  ];

  const recommended: CompletenessItem[] = [
    {
      id: "mediums",
      label: "Add your mediums",
      done: artist.mediums.length > 0,
      href: "#mediums",
    },
    {
      id: "website",
      label: "Add website URL",
      done: Boolean(artist.websiteUrl?.trim()),
      href: "#website",
    },
    {
      id: "instagram",
      label: "Add Instagram",
      done: Boolean(artist.instagramUrl?.trim()),
      href: "#instagram",
    },
    {
      id: "nationality",
      label: "Add nationality",
      done: Boolean(artist.nationality?.trim()),
      href: "#nationality",
    },
    {
      id: "birthYear",
      label: "Add birth year",
      done: artist.birthYear != null,
      href: "#birthyear",
    },
  ];

  const totalItems = required.length + recommended.length;
  const doneItems = [...required, ...recommended].filter((i) => i.done).length;
  const score = Math.round((doneItems / totalItems) * 100);
  const canGoLive = required.every((i) => i.done);

  return { score, required, recommended, canGoLive };
}

export function evaluateVenueReadiness(venue: { name: string | null; city: string | null; country: string | null; featuredAssetId: string | null; websiteUrl?: string | null; lat?: number | null; lng?: number | null }): ReadinessResult {
  const blocking: CheckItem[] = [];
  const warnings: CheckItem[] = [];

  if (!hasText(venue.name)) blocking.push({ id: "venue-name", label: "Add venue name.", severity: "block", href: "#name" });
  if (!hasText(venue.city)) blocking.push({ id: "venue-city", label: "Add city.", severity: "block", href: "#city" });
  if (!hasText(venue.country)) blocking.push({ id: "venue-country", label: "Add country.", severity: "block", href: "#country" });
  if (!venue.featuredAssetId) blocking.push({ id: "venue-cover", label: "Add venue cover image.", severity: "block", href: "#images" });
  if (venue.lat == null || venue.lng == null) blocking.push({ id: "coordinates", label: "Add venue coordinates.", severity: "block", href: "#location" });
  if (!hasText(venue.websiteUrl)) warnings.push({ id: "venue-website", label: "Add venue website URL (recommended).", severity: "warn", href: "#websiteUrl" });

  return { ready: blocking.length === 0, blocking, warnings };
}

export function evaluateEventReadiness(event: { title: string | null; startAt: Date | null; endAt: Date | null; venueId: string | null; ticketUrl?: string | null }, venue?: { id: string } | null): ReadinessResult {
  const blocking: CheckItem[] = [];
  const warnings: CheckItem[] = [];

  if (!hasText(event.title)) blocking.push({ id: "event-title", label: "Add event title.", severity: "block", href: "#title" });
  if (!event.startAt) blocking.push({ id: "event-start", label: "Add event start date/time.", severity: "block", href: "#startAt" });
  if (event.startAt && event.endAt && event.endAt < event.startAt) blocking.push({ id: "event-end", label: "End date/time must be on or after start date/time.", severity: "block", href: "#endAt" });
  if (!event.venueId || !venue) blocking.push({ id: "event-venue", label: "Link this event to a managed venue.", severity: "block", href: "#venueId" });
  if (!hasText(event.ticketUrl)) warnings.push({ id: "event-ticket", label: "Add ticket URL (recommended).", severity: "warn", href: "#ticketUrl" });

  return { ready: blocking.length === 0, blocking, warnings };
}

export function evaluateArtworkReadiness(artwork: { title: string | null; featuredAssetId: string | null; medium?: string | null; year?: number | null }, images: Array<{ id: string; assetId?: string | null }>): ReadinessResult {
  const blocking: CheckItem[] = [];
  const warnings: CheckItem[] = [];

  if (!hasText(artwork.title)) blocking.push({ id: "artwork-title", label: "Add artwork title.", severity: "block", href: "#title" });
  if (images.length === 0) blocking.push({ id: "artwork-images", label: "Add at least one artwork image.", severity: "block", href: "#images" });
  if (!artwork.featuredAssetId && images.length === 0) blocking.push({ id: "artwork-cover", label: "Add a cover image.", severity: "block", href: "#images" });
  if (!hasText(artwork.medium) || !artwork.year) warnings.push({ id: "artwork-medium-year", label: "Add medium and year (recommended).", severity: "info" });

  return { ready: blocking.length === 0, blocking, warnings };
}

function hasLegacyText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function computeVenuePublishBlockers(venue: { country?: string | null; lat?: number | null; lng?: number | null; name?: string | null; city?: string | null }): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!hasLegacyText(venue.country)) blockers.push({ id: "country", message: "Country is required." });
  if (venue.lat == null || venue.lng == null) blockers.push({ id: "coordinates", message: "Coordinates are required." });
  if (!hasLegacyText(venue.name)) blockers.push({ id: "name", message: "Venue name is required." });
  if (!hasLegacyText(venue.city)) blockers.push({ id: "city", message: "City is required." });
  return blockers;
}

export function computeEventPublishBlockers(event: { startAt: Date | null; timezone?: string | null; venue?: { status?: string | null; isPublished?: boolean | null } | null; hasImage?: boolean }): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!event.startAt) blockers.push({ id: "startAt", message: "Event start date is required." });
  if (!hasLegacyText(event.timezone)) blockers.push({ id: "timezone", message: "Event timezone is required." });
  const venuePublished = event.venue?.status === "PUBLISHED" || event.venue?.isPublished === true;
  if (!venuePublished) blockers.push({ id: "venue", message: "Event venue must be published." });
  if (event.hasImage === false) blockers.push({ id: "coverImage", message: "At least one event image is required." });
  return blockers;
}

export function computeReadiness(entity: { startAt: Date | null; timezone?: string | null; venue?: { status?: string | null; isPublished?: boolean | null } | null } | { country?: string | null; lat?: number | null; lng?: number | null; name?: string | null; city?: string | null }): PublishReadiness {
  const blockers = "startAt" in entity
    ? computeEventPublishBlockers(entity).map((blocker) => blocker.message)
    : computeVenuePublishBlockers(entity).map((blocker) => blocker.message);

  return {
    ready: blockers.length === 0,
    blockers,
  };
}
