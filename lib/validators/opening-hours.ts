import { z } from "zod";

export const openingHoursDaySchema = z.object({
  day: z.number().int().min(0).max(6),
  // 0 = Sunday, 1 = Monday … 6 = Saturday (JS Date convention)
  open: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  close: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  closed: z.boolean().default(false),
});

export const openingHoursSchema = z.array(
  openingHoursDaySchema,
);

export type OpeningHoursDay = z.infer<typeof openingHoursDaySchema>;
export type OpeningHours = z.infer<typeof openingHoursSchema>;

// Safe parser — returns null if the value cannot be parsed
// into the canonical shape. Used when reading existing
// JSON? field values from the DB.
export function parseOpeningHours(
  value: unknown,
): OpeningHours | null {
  const result = openingHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}

// Human-readable day names indexed by JS day (0 = Sunday)
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the opening hours entry for the current day
 * in the venue's timezone, and whether the venue is
 * currently open.
 */
export function getOpenNowStatus(
  hours: OpeningHours,
  timezone: string | null,
): {
  todayEntry: OpeningHoursDay | null;
  isOpen: boolean;
  currentTime: string;
} {
  const now = new Date();
  // Validate timezone — fall back to UTC if invalid or empty.
  const tz = timezone && isValidTimezone(timezone) ? timezone : "UTC";

  const dayNum = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(now),
  );

  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const todayEntry = hours.find((h) => h.day === dayNum) ?? null;

  let isOpen = false;
  if (
    todayEntry
    && !todayEntry.closed
    && todayEntry.open
    && todayEntry.close
  ) {
    isOpen = timeStr >= todayEntry.open && timeStr < todayEntry.close;
  }

  return { todayEntry, isOpen, currentTime: timeStr };
}
