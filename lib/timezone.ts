import tzLookup from "tz-lookup";

export function inferTimezoneFromLatLng(lat: number, lng: number): string {
  return tzLookup(lat, lng);
}

export function isValidIanaTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}
