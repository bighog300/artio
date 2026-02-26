export type EventCompletionChecks = {
  basics: boolean;
  schedule: boolean;
  location: boolean;
  images: boolean;
  readyToSubmit: boolean;
  locationRequired: boolean;
  imagesRequired: boolean;
  linksOptional: boolean;
  missing: string[];
};

type EventInput = {
  title: string | null;
  venueId: string | null;
  startAt: Date | null;
  endAt: Date | null;
  featuredAssetId?: string | null;
};

type VenueInput = {
  id: string;
  lat: number | null;
  lng: number | null;
} | null | undefined;

export function getEventCompletionChecks({ event, venueForEvent }: { event: EventInput; venueForEvent?: VenueInput }): EventCompletionChecks {
  const basics = Boolean(event.title?.trim() && event.venueId);
  const schedule = Boolean(event.startAt && (!event.endAt || event.endAt >= event.startAt));

  const hasVenueCoords = venueForEvent?.lat != null && venueForEvent?.lng != null;
  const locationRequired = false;
  const location = locationRequired ? hasVenueCoords : Boolean(event.venueId ? hasVenueCoords : false);

  const imagesRequired = false;
  const images = Boolean(event.featuredAssetId);

  const requiredReady = basics && schedule && (locationRequired ? location : true) && (imagesRequired ? images : true);

  const missing: string[] = [];
  if (!basics) missing.push("Basics");
  if (!schedule) missing.push("Schedule");
  if (locationRequired && !location) missing.push("Location");
  if (imagesRequired && !images) missing.push("Images");

  return {
    basics,
    schedule,
    location,
    images,
    readyToSubmit: requiredReady,
    locationRequired,
    imagesRequired,
    linksOptional: true,
    missing,
  };
}
