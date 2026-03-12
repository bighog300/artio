const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_INDEX = new Map(DAY_ORDER.map((day, index) => [day.toLowerCase(), index]));

type OpeningHoursStructured = Record<string, { open: string; close: string }>;

function normalizeDayToken(token: string): string | null {
  const normalized = token.trim().slice(0, 3).toLowerCase();
  const index = DAY_INDEX.get(normalized);
  return index === undefined ? null : DAY_ORDER[index];
}

function expandDayRange(start: string, end: string): string[] {
  const startIndex = DAY_INDEX.get(start.toLowerCase());
  const endIndex = DAY_INDEX.get(end.toLowerCase());
  if (startIndex === undefined || endIndex === undefined) return [];
  if (startIndex <= endIndex) return DAY_ORDER.slice(startIndex, endIndex + 1);
  return [...DAY_ORDER.slice(startIndex), ...DAY_ORDER.slice(0, endIndex + 1)];
}

export function validateEmail(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function validateSocialUrl(value: string | null, expectedHost: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const normalizedHost = parsed.hostname.toLowerCase();
    const expected = expectedHost.toLowerCase();
    if (!(normalizedHost === expected || normalizedHost.endsWith(`.${expected}`))) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseOpeningHours(raw: string | null): { raw: string; structured: OpeningHoursStructured | null } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const structured: OpeningHoursStructured = {};
  const segments = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const segmentRegex = /^([A-Za-z]{3})(?:\s*-\s*([A-Za-z]{3}))?\s+([0-2]?\d(?::[0-5]\d)?(?:\s?[APMapm]{2})?)\s*-\s*([0-2]?\d(?::[0-5]\d)?(?:\s?[APMapm]{2})?)$/;

  for (const segment of segments) {
    const match = segment.match(segmentRegex);
    if (!match) return { raw: trimmed, structured: null };

    const [, startDayToken, endDayToken, open, close] = match;
    const startDay = normalizeDayToken(startDayToken);
    const endDay = endDayToken ? normalizeDayToken(endDayToken) : startDay;

    if (!startDay || !endDay) return { raw: trimmed, structured: null };

    const days = expandDayRange(startDay, endDay);
    if (days.length === 0) return { raw: trimmed, structured: null };

    for (const day of days) {
      structured[day] = { open: open.trim(), close: close.trim() };
    }
  }

  return {
    raw: trimmed,
    structured: Object.keys(structured).length > 0 ? structured : null,
  };
}
