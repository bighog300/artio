type VEventInput = {
  uid: string;
  summary: string;
  startAt: Date;
  endAt?: Date | null;
  timezone: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  dtstamp?: Date;
};

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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

function formatDateAsUtc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDateInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}${byType.month}${byType.day}T${byType.hour}${byType.minute}${byType.second}`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptPlainText(value: string, maxLength = 1200) {
  const plain = stripMarkdown(value);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildVEvent(input: VEventInput) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(input.uid)}`,
    `DTSTAMP:${formatDateAsUtc(input.dtstamp ?? new Date())}`,
    `DTSTART;TZID=${escapeIcalText(input.timezone)}:${formatDateInTimezone(input.startAt, input.timezone)}`,
    `SUMMARY:${escapeIcalText(input.summary)}`,
  ];

  if (input.endAt) {
    lines.push(`DTEND;TZID=${escapeIcalText(input.timezone)}:${formatDateInTimezone(input.endAt, input.timezone)}`);
  }
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcalText(excerptPlainText(input.description))}`);
  }
  if (input.location?.trim()) {
    lines.push(`LOCATION:${escapeIcalText(input.location.trim())}`);
  }
  if (input.url?.trim()) {
    lines.push(`URL:${escapeIcalText(input.url.trim())}`);
  }

  lines.push("END:VEVENT");
  return `${lines.join("\r\n")}\r\n`;
}

export function buildVCalendar(vevents: string[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Artio//Calendar Feed//EN",
    ...vevents.flatMap((eventText) => eventText.split("\r\n").filter(Boolean)),
    "END:VCALENDAR",
  ];

  return `${lines.map((line) => foldLine(line)).join("\r\n")}\r\n`;
}

