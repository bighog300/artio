import test from "node:test";
import assert from "node:assert/strict";
import { matchEventToSavedSearch } from "../lib/saved-searches/match-event";

test("matches keyword in title/description", () => {
  const matches = matchEventToSavedSearch(
    {
      title: "Downtown Abstract Opening",
      description: "An evening focused on abstract painting and sculpture.",
      startAt: "2026-08-20T18:00:00.000Z",
      tags: [{ slug: "abstract" }],
    },
    {
      type: "EVENTS_FILTER",
      paramsJson: { q: "abstract painting", tags: [] },
    },
  );

  assert.equal(matches, true);
});

test("matches on tag overlap", () => {
  const matches = matchEventToSavedSearch(
    {
      title: "Gallery Night",
      description: "Featured artists across the city.",
      startAt: "2026-08-21T18:00:00.000Z",
      tags: [{ slug: "photography" }, { name: "Contemporary" }],
    },
    {
      type: "EVENTS_FILTER",
      paramsJson: { tags: ["photography"] },
    },
  );

  assert.equal(matches, true);
});

test("returns false when one filter fails (partial match)", () => {
  const matches = matchEventToSavedSearch(
    {
      title: "City Art Fair",
      description: "Annual fair with many galleries.",
      startAt: "2026-08-22T18:00:00.000Z",
      tags: [{ slug: "painting" }],
    },
    {
      type: "EVENTS_FILTER",
      paramsJson: { q: "fair", tags: ["sculpture"] },
    },
  );

  assert.equal(matches, false);
});

test("returns false when there is no keyword or date overlap", () => {
  const matches = matchEventToSavedSearch(
    {
      title: "Ceramics Workshop",
      description: "Hands-on clay techniques.",
      startAt: "2026-09-10T10:00:00.000Z",
      tags: [{ slug: "ceramics" }],
    },
    {
      type: "EVENTS_FILTER",
      paramsJson: { q: "photography", from: "2026-08-01T00:00:00.000Z", to: "2026-08-31T23:59:59.000Z", tags: [] },
    },
  );

  assert.equal(matches, false);
});
