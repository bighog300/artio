type IcalEvent = {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend?: Date | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtcDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function foldLine(line: string, maxLength = 75) {
  if (line.length <= maxLength) return line;
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += maxLength) {
    const chunk = line.slice(index, index + maxLength);
    chunks.push(index === 0 ? chunk : ` ${chunk}`);
  }
  return chunks.join("\r\n");
}

function eventToLines(event: IcalEvent) {
  const end = event.dtend ?? event.dtstart;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(event.uid)}`,
    `DTSTAMP:${formatUtcDate(new Date())}`,
    `DTSTART:${formatUtcDate(event.dtstart)}`,
    `DTEND:${formatUtcDate(end)}`,
    `SUMMARY:${escapeIcalText(event.summary)}`,
  ];

  if (event.location?.trim()) lines.push(`LOCATION:${escapeIcalText(event.location.trim())}`);
  if (event.description?.trim()) lines.push(`DESCRIPTION:${escapeIcalText(event.description.trim())}`);
  if (event.url?.trim()) lines.push(`URL:${escapeIcalText(event.url.trim())}`);

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcalCalendar(calendarName: string, events: IcalEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Artio//Calendar Feed//EN",
    `X-WR-CALNAME:${escapeIcalText(calendarName)}`,
    ...events.flatMap((event) => eventToLines(event)),
    "END:VCALENDAR",
  ];

  return `${lines.map((line) => foldLine(line)).join("\r\n")}\r\n`;
}

export type { IcalEvent };
