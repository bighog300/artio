export const EVENT_TYPE_OPTIONS = [
  "EXHIBITION",
  "FAIR",
  "OPENING",
  "WORKSHOP",
  "TALK",
  "SCREENING",
  "RESIDENCY",
  "OTHER",
] as const;

export type EventTypeOption = (typeof EVENT_TYPE_OPTIONS)[number];

export function getEventTypeLabel(eventType: EventTypeOption | string | null | undefined) {
  switch (eventType) {
    case "EXHIBITION":
      return "Exhibition";
    case "FAIR":
      return "Fair";
    case "OPENING":
      return "Opening";
    case "WORKSHOP":
      return "Workshop";
    case "TALK":
      return "Talk";
    case "SCREENING":
      return "Screening";
    case "RESIDENCY":
      return "Residency";
    case "OTHER":
      return "Other";
    default:
      return "Other";
  }
}
