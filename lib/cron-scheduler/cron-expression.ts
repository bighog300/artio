const MAX_MINUTES_LOOKAHEAD = 366 * 24 * 60;

type CronField = Set<number>;

function parseField(raw: string, min: number, max: number): CronField {
  const values = new Set<number>();
  for (const segment of raw.split(",")) {
    const part = segment.trim();
    if (!part) continue;
    if (part === "*") {
      for (let i = min; i <= max; i += 1) values.add(i);
      continue;
    }

    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      if (!Number.isInteger(step) || step <= 0) throw new Error("invalid step");
      for (let i = min; i <= max; i += step) values.add(i);
      continue;
    }

    const num = Number(part);
    if (!Number.isInteger(num) || num < min || num > max) throw new Error("invalid value");
    values.add(num);
  }

  if (values.size === 0) throw new Error("empty field");
  return values;
}

function parseSchedule(schedule: string) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron requires 5 fields");
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

export function computeNextFireAt(schedule: string, after: Date): Date | null {
  try {
    const parsed = parseSchedule(schedule);
    const cursor = new Date(after);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    for (let i = 0; i < MAX_MINUTES_LOOKAHEAD; i += 1) {
      const minute = cursor.getMinutes();
      const hour = cursor.getHours();
      const dayOfMonth = cursor.getDate();
      const month = cursor.getMonth() + 1;
      const dayOfWeek = cursor.getDay();
      if (
        parsed.minute.has(minute) &&
        parsed.hour.has(hour) &&
        parsed.dayOfMonth.has(dayOfMonth) &&
        parsed.month.has(month) &&
        parsed.dayOfWeek.has(dayOfWeek)
      ) {
        return new Date(cursor);
      }
      cursor.setMinutes(cursor.getMinutes() + 1);
    }

    return null;
  } catch {
    return null;
  }
}
