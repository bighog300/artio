export type PublishBlocker = { id: string; message: string };
export type PublishReadiness = { ready: boolean; blockers: string[] };

type VenueEntity = {
  country: string | null;
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  city?: string | null;
};

type EventEntity = {
  startAt: Date | null;
  timezone: string | null;
  venue: { status?: string | null; isPublished?: boolean | null } | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function computeVenuePublishBlockers(venue: VenueEntity): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!hasText(venue.country)) blockers.push({ id: "country", message: "Country is required." });
  if (venue.lat == null || venue.lng == null) blockers.push({ id: "coordinates", message: "Coordinates are required." });
  if (!hasText(venue.name)) blockers.push({ id: "name", message: "Venue name is required." });
  if (!hasText(venue.city)) blockers.push({ id: "city", message: "City is required." });
  return blockers;
}

export function computeEventPublishBlockers(event: EventEntity): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!event.startAt) blockers.push({ id: "startAt", message: "Event start date is required." });
  if (!hasText(event.timezone)) blockers.push({ id: "timezone", message: "Event timezone is required." });
  const venuePublished = event.venue?.status === "PUBLISHED" || event.venue?.isPublished === true;
  if (!venuePublished) blockers.push({ id: "venue", message: "Event venue must be published." });
  return blockers;
}

export function computeReadiness(entity: VenueEntity | EventEntity): PublishReadiness {
  const blockers = "startAt" in entity
    ? computeEventPublishBlockers(entity).map((blocker) => blocker.message)
    : computeVenuePublishBlockers(entity).map((blocker) => blocker.message);

  return {
    ready: blockers.length === 0,
    blockers,
  };
}
