import test from "node:test";
import assert from "node:assert/strict";
import { buildIcalCalendar } from "@/lib/calendar/ical-format";

test("ical format uses dtstart fallback when dtend is null", () => {
  const text = buildIcalCalendar("Test", [{
    uid: "1",
    summary: "Event",
    dtstart: new Date("2026-04-01T10:00:00.000Z"),
    dtend: null,
  }]);

  const dtstart = text.match(/DTSTART:(\d+)/)?.[1];
  const dtend = text.match(/DTEND:(\d+)/)?.[1];
  assert.equal(dtend, dtstart);
});

test("ical format uses provided dtend when set", () => {
  const text = buildIcalCalendar("Test", [{
    uid: "1",
    summary: "Event",
    dtstart: new Date("2026-04-01T10:00:00.000Z"),
    dtend: new Date("2026-04-01T12:00:00.000Z"),
  }]);

  assert.match(text, /DTEND:20260401T120000Z/);
});

test("ical format folds long lines at 75 chars", () => {
  const text = buildIcalCalendar("Test", [{
    uid: "1",
    summary: "A".repeat(120),
    dtstart: new Date("2026-04-01T10:00:00.000Z"),
  }]);

  assert.match(text, /\r\n /);
});

test("ical format escapes special characters", () => {
  const text = buildIcalCalendar("Test", [{
    uid: "1",
    summary: "Hello, world; ok",
    dtstart: new Date("2026-04-01T10:00:00.000Z"),
    location: "A;B,C",
    description: "line1\\line2\nnext",
  }]);

  assert.match(text, /SUMMARY:Hello\\, world\\; ok/);
  assert.match(text, /LOCATION:A\\;B\\,C/);
  assert.match(text, /DESCRIPTION:line1\\\\line2\\nnext/);
});
