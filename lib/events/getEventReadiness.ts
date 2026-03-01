export type EventReadinessItem = { label: string; complete: boolean };

export function getEventReadiness(event: {
  title: string | null;
  description: string | null;
  featuredAssetId: string | null;
  venueId: string | null;
  startAt: Date | null;
}): { isReady: boolean; items: EventReadinessItem[] } {
  const items: EventReadinessItem[] = [
    { label: "Title", complete: Boolean(event.title?.trim()) },
    { label: "Description", complete: Boolean(event.description?.trim()) },
    { label: "Cover image", complete: Boolean(event.featuredAssetId) },
    { label: "Venue", complete: Boolean(event.venueId) },
    { label: "Start date/time", complete: Boolean(event.startAt) },
  ];

  return {
    isReady: items.every((item) => item.complete),
    items,
  };
}
