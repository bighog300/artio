import test from "node:test";
import assert from "node:assert/strict";
import { computeConfidence, sanitizeReasons } from "@/lib/ingest/confidence";

const prevHigh = process.env.AI_INGEST_CONFIDENCE_HIGH_MIN;
const prevMedium = process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN;

test.after(() => {
  process.env.AI_INGEST_CONFIDENCE_HIGH_MIN = prevHigh;
  process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN = prevMedium;
});

test("complete candidate scores HIGH", () => {
  process.env.AI_INGEST_CONFIDENCE_HIGH_MIN = "75";
  process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN = "45";

  const result = computeConfidence({
    title: "Summer Opening Night",
    startAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    timezone: "UTC",
    locationText: "Main Hall",
    description: "A full evening program with artist talks, live score, and opening reception.",
    sourceUrl: "https://venue.example/events/2026-07-01/summer-opening",
    artistNames: ["Alice Smith"],
    imageUrl: "https://example.com/img.jpg",
  });

  assert.equal(result.band, "HIGH");
  assert.ok(result.score >= 75);
});

test("missing key fields scores LOW", () => {
  const result = computeConfidence({
    title: "New",
    startAt: null,
    endAt: null,
    timezone: null,
    locationText: null,
    description: "short",
    sourceUrl: "https://venue.example/",
    artistNames: [],
    imageUrl: null,
  });

  assert.equal(result.band, "LOW");
  assert.ok(result.score <= 20);
});

test("generic title is penalized", () => {
  const result = computeConfidence({
    title: "Home",
    startAt: new Date("2026-07-01T19:00:00.000Z"),
    endAt: null,
    timezone: "UTC",
    locationText: "Main Hall",
    description: "A long enough description that still should get title penalty from generic name.",
    sourceUrl: "https://venue.example/events/home",
    artistNames: [],
    imageUrl: null,
  });

  assert.ok(result.reasons.some((reason) => reason.includes("generic title")));
  assert.ok(result.score < 100);
});

test("threshold env controls bands", () => {
  process.env.AI_INGEST_CONFIDENCE_HIGH_MIN = "95";
  process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN = "50";

  const result = computeConfidence({
    title: "Talk",
    startAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    endAt: null,
    timezone: "UTC",
    locationText: "Main Hall",
    description: "A concise but descriptive listing with enough detail.",
    sourceUrl: "https://venue.example/events/talk",
    artistNames: ["Alice Smith"],
    imageUrl: null,
  });

  assert.equal(result.band, "MEDIUM");
});

test("sanitizeReasons bounds output", () => {
  const reasons = sanitizeReasons(Array.from({ length: 12 }).map((_, idx) => `reason-${idx}-${"x".repeat(100)}`));
  assert.equal(reasons.length, 8);
  assert.ok(reasons.every((reason) => reason.length <= 80));
});


test("recognizes exhibition and programme specific urls", () => {
  const expectedHighConfidence = {
    title: "Signal",
    startAt: null,
    endAt: null,
    timezone: null,
    locationText: null,
    description: "",
    artistNames: [],
    imageUrl: null,
  };

  const exhibition = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/exhibitions/artist-name" });
  const shows = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/shows/spring-2026" });
  const programme = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/programme/current" });
  const whatsOn = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/whats-on/2026-03" });
  const about = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/about" });
  const root = computeConfidence({ ...expectedHighConfidence, sourceUrl: "https://venue.example/" });

  assert.ok(exhibition.reasons.includes("specific source url"));
  assert.ok(shows.reasons.includes("specific source url"));
  assert.ok(programme.reasons.includes("specific source url"));
  assert.ok(whatsOn.reasons.includes("specific source url"));
  assert.ok(!about.reasons.includes("specific source url"));
  assert.ok(!root.reasons.includes("specific source url"));
});


test("json-ld extraction method adds confidence bonus and reason", () => {
  const candidate = {
    title: "Show",
    startAt: new Date("2026-07-01T19:00:00.000Z"),
    endAt: null,
    timezone: null,
    locationText: null,
    description: "",
    sourceUrl: "https://venue.example/events/show",
    artistNames: [],
    imageUrl: null,
  };

  const withoutMethod = computeConfidence(candidate);
  const withJsonLd = computeConfidence(candidate, { extractionMethod: "json_ld" });

  assert.equal(withJsonLd.score, Math.min(100, withoutMethod.score + 20));
  assert.ok(withJsonLd.reasons.includes("structured json-ld source"));
});

test("openai extraction method adds confidence bonus and reason", () => {
  const candidate = {
    title: "Stable",
    startAt: new Date("2026-07-01T19:00:00.000Z"),
    endAt: null,
    timezone: null,
    locationText: "Main Hall",
    description: "Short description with enough detail to avoid penalties.",
    sourceUrl: "https://venue.example/events/stable",
    artistNames: [],
    imageUrl: null,
  };

  const baseline = computeConfidence(candidate);
  const explicitOpenAi = computeConfidence(candidate, { extractionMethod: "openai" });

  assert.equal(explicitOpenAi.score, Math.min(100, baseline.score + 5));
  assert.ok(explicitOpenAi.reasons.includes("ai-structured extraction"));
});

test("artist names boost score", () => {
  const baseCandidate = {
    title: "Gallery Show",
    startAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    endAt: null,
    timezone: "UTC",
    locationText: "Main Gallery",
    description: "A solo exhibition featuring new works.",
    sourceUrl: "https://venue.example/events/gallery-show",
    artistNames: [],
    imageUrl: null,
  };

  const base = computeConfidence(baseCandidate);
  const withArtists = computeConfidence({
    ...baseCandidate,
    artistNames: ["Alice Smith", "Bob Jones"],
    imageUrl: "https://venue.example/img.jpg",
  });

  assert.ok(withArtists.score > base.score);
  assert.ok(withArtists.reasons.some((r) => r.includes("named artists")));
  assert.ok(withArtists.reasons.some((r) => r.includes("event image")));
});

test("recency bonus applies within 90 days", () => {
  const soon = computeConfidence({
    title: "Upcoming Show",
    startAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    endAt: null,
    timezone: "UTC",
    locationText: null,
    description: null,
    sourceUrl: null,
    artistNames: [],
    imageUrl: null,
  });
  const far = computeConfidence({
    title: "Upcoming Show",
    startAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
    endAt: null,
    timezone: "UTC",
    locationText: null,
    description: null,
    sourceUrl: null,
    artistNames: [],
    imageUrl: null,
  });
  assert.ok(soon.score > far.score);
  assert.ok(soon.reasons.some((r) => r.includes("90 days")));
});
