import test from "node:test";
import assert from "node:assert/strict";
import { computeConfidence } from "@/lib/ingest/confidence";

const penaltyBase = {
  title: "Event Name",
  startAt: new Date("2026-06-10T12:00:00.000Z"),
  endAt: null,
  timezone: null,
  locationText: null,
  description: null,
  sourceUrl: null,
  artistNames: [],
  imageUrl: null,
};

test("round-number date penalty applies on first-of-month midnight UTC", () => {
  const control = computeConfidence({ ...penaltyBase, startAt: new Date("2026-04-01T00:00:01.000Z") });
  const penalized = computeConfidence({ ...penaltyBase, startAt: new Date("2026-04-01T00:00:00.000Z") });

  assert.equal(control.score - penalized.score, 10);
  assert.ok(penalized.reasons.some((reason) => reason.includes("round-number date")));
});

test("round-number date penalty does not apply for non-midnight, non-first-day, and null startAt", () => {
  const nonMidnight = computeConfidence({ ...penaltyBase, startAt: new Date("2026-04-01T14:30:00.000Z") });
  const nonFirstDay = computeConfidence({ ...penaltyBase, startAt: new Date("2026-04-15T00:00:00.000Z") });
  const nullStart = computeConfidence({ ...penaltyBase, startAt: null });

  assert.equal(nonMidnight.reasons.some((reason) => reason.includes("round-number date")), false);
  assert.equal(nonFirstDay.reasons.some((reason) => reason.includes("round-number date")), false);
  assert.equal(nullStart.reasons.some((reason) => reason.includes("round-number date")), false);
});

test("artist name matching venue name applies case-insensitive penalty", () => {
  const control = computeConfidence({ ...penaltyBase, artistNames: ["Sarah Lucas"] }, { venueName: "Whitechapel Gallery" });
  const exact = computeConfidence({ ...penaltyBase, artistNames: ["Whitechapel Gallery"] }, { venueName: "Whitechapel Gallery" });
  const caseInsensitive = computeConfidence({ ...penaltyBase, artistNames: ["whitechapel gallery"] }, { venueName: "Whitechapel Gallery" });

  assert.equal(control.score - exact.score, 8);
  assert.equal(control.score - caseInsensitive.score, 8);
  assert.ok(exact.reasons.includes("artist name matches venue name"));
  assert.ok(caseInsensitive.reasons.includes("artist name matches venue name"));
});

test("artist/venue penalty not applied for non-matching names, empty artist list, or null venue", () => {
  const mismatch = computeConfidence({ ...penaltyBase, artistNames: ["Sarah Lucas"] }, { venueName: "Whitechapel Gallery" });
  const noArtists = computeConfidence({ ...penaltyBase, artistNames: [] }, { venueName: "Whitechapel Gallery" });
  const noVenue = computeConfidence({ ...penaltyBase, artistNames: ["Whitechapel Gallery"] }, { venueName: null });

  assert.equal(mismatch.reasons.includes("artist name matches venue name"), false);
  assert.equal(noArtists.reasons.includes("artist name matches venue name"), false);
  assert.equal(noVenue.reasons.includes("artist name matches venue name"), false);
});

test("numeric or short title penalty applies for '1', '42', and 'AB'", () => {
  const control = computeConfidence({ ...penaltyBase, title: "Art" });
  const one = computeConfidence({ ...penaltyBase, title: "1" });
  const fortyTwo = computeConfidence({ ...penaltyBase, title: "42" });
  const ab = computeConfidence({ ...penaltyBase, title: "AB" });

  assert.equal(control.score - one.score, 15);
  assert.equal(control.score - fortyTwo.score, 15);
  assert.equal(control.score - ab.score, 15);
  assert.ok(one.reasons.includes("title is numeric or too short"));
  assert.ok(fortyTwo.reasons.includes("title is numeric or too short"));
  assert.ok(ab.reasons.includes("title is numeric or too short"));
});

test("title penalty does not apply for 'Art', 'Summer Exhibition', and empty title", () => {
  const threeChars = computeConfidence({ ...penaltyBase, title: "Art" });
  const longTitle = computeConfidence({ ...penaltyBase, title: "Summer Exhibition" });
  const emptyTitle = computeConfidence({ ...penaltyBase, title: "" });

  assert.equal(threeChars.reasons.includes("title is numeric or too short"), false);
  assert.equal(longTitle.reasons.includes("title is numeric or too short"), false);
  assert.equal(emptyTitle.reasons.includes("title is numeric or too short"), false);
});

test("stacked penalties clamp score at 0", () => {
  const lowCandidate = {
    title: "1",
    startAt: null,
    endAt: null,
    timezone: null,
    locationText: null,
    description: "",
    sourceUrl: null,
    artistNames: ["Whitechapel Gallery"],
    imageUrl: null,
  };

  const result = computeConfidence(lowCandidate, { venueName: "Whitechapel Gallery" });
  assert.equal(result.score, 0);
});
