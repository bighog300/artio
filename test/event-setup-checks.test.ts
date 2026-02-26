import test from "node:test";
import assert from "node:assert/strict";
import { getEventCompletionChecks } from "../lib/events/event-completion";

test("missing title makes basics and ready false", () => {
  const checks = getEventCompletionChecks({
    event: { title: "", venueId: "ven_1", startAt: new Date("2025-01-01T10:00:00Z"), endAt: null, featuredAssetId: null },
    venueForEvent: { id: "ven_1", lat: 1, lng: 2 },
  });
  assert.equal(checks.basics, false);
  assert.equal(checks.readyToSubmit, false);
});

test("missing venue makes basics false", () => {
  const checks = getEventCompletionChecks({
    event: { title: "Event", venueId: null, startAt: new Date("2025-01-01T10:00:00Z"), endAt: null, featuredAssetId: null },
  });
  assert.equal(checks.basics, false);
});

test("missing startAt makes schedule false", () => {
  const checks = getEventCompletionChecks({
    event: { title: "Event", venueId: "ven_1", startAt: null, endAt: null, featuredAssetId: null },
  });
  assert.equal(checks.schedule, false);
});

test("endAt before startAt makes schedule false", () => {
  const checks = getEventCompletionChecks({
    event: { title: "Event", venueId: "ven_1", startAt: new Date("2025-01-01T11:00:00Z"), endAt: new Date("2025-01-01T10:00:00Z"), featuredAssetId: null },
  });
  assert.equal(checks.schedule, false);
});

test("location does not block ready when optional and venue coords missing", () => {
  const checks = getEventCompletionChecks({
    event: { title: "Event", venueId: "ven_1", startAt: new Date("2025-01-01T10:00:00Z"), endAt: null, featuredAssetId: null },
    venueForEvent: { id: "ven_1", lat: null, lng: null },
  });
  assert.equal(checks.location, false);
  assert.equal(checks.readyToSubmit, true);
});
