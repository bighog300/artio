import test from "node:test";
import assert from "node:assert/strict";
import { computeArtworkFingerprint } from "@/lib/ingest/artwork-extraction";

test("same title + same artist + same event yields same fingerprint", () => {
  const first = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "  Untitled  ",
      artistName: "Jane Doe",
      year: 2024,
      dimensions: "100 x 200 cm",
    },
  });

  const second = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "untitled",
      artistName: "  jane   doe ",
      year: 2024,
      dimensions: "100   x 200  cm",
    },
  });

  assert.equal(first, second);
});

test("same title + different artist + same event yields different fingerprints", () => {
  const first = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: "Jane Doe",
      year: 2024,
      dimensions: "100 x 200 cm",
    },
  });

  const second = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: "John Doe",
      year: 2024,
      dimensions: "100 x 200 cm",
    },
  });

  assert.notEqual(first, second);
});

test("same title + same artist + different year + same event yields different fingerprints", () => {
  const first = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: "Jane Doe",
      year: 2023,
      dimensions: "100 x 200 cm",
    },
  });

  const second = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: "Jane Doe",
      year: 2024,
      dimensions: "100 x 200 cm",
    },
  });

  assert.notEqual(first, second);
});

test("null fields are treated as empty strings", () => {
  const withNulls = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: null,
      year: null,
      dimensions: null,
    },
  });

  const withEmpties = computeArtworkFingerprint({
    eventId: "event-1",
    sourceUrl: "https://example.com/source",
    artwork: {
      title: "Untitled",
      artistName: "",
      year: null,
      dimensions: "",
    },
  });

  assert.equal(withNulls, withEmpties);
  assert.equal(typeof withNulls, "string");
  assert.equal(withNulls.length, 64);
});
