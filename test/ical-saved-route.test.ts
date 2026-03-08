import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { handleIcalSavedGet } from "@/lib/calendar/ical-saved-route";

test("saved iCal returns calendar content when events exist", async () => {
  const response = await handleIcalSavedGet({
    getUser: async () => ({ id: "user-1" }),
    findFavorites: async () => [{ targetId: "event-1" }],
    findEvents: async () => [{
      id: "event-1",
      title: "My Event",
      slug: "my-event",
      description: "Desc",
      startAt: new Date("2026-05-01T10:00:00.000Z"),
      endAt: null,
      venue: { name: "Venue", addressLine1: "Street" },
    }],
  } as never);

  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  const text = await response.text();
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.match(text, /BEGIN:VEVENT/);
});

test("saved iCal returns empty VCALENDAR when no favorites", async () => {
  const response = await handleIcalSavedGet({
    getUser: async () => ({ id: "user-1" }),
    findFavorites: async () => [],
    findEvents: async () => [],
  } as never);

  const text = await response.text();
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.doesNotMatch(text, /BEGIN:VEVENT/);
});

test("saved iCal returns 401 when not authenticated", async () => {
  const response = await handleIcalSavedGet({
    getUser: async () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    findFavorites: async () => [],
    findEvents: async () => [],
  } as never);

  assert.equal(response.status, 401);
});
