import test from "node:test";
import assert from "node:assert/strict";
import { parseExtractedEventsFromModel } from "@/lib/ingest/schemas";

test("accepts relative imageUrl and preserves it", () => {
  const parsed = parseExtractedEventsFromModel([
    {
      title: "Spring Exhibition",
      imageUrl: "/images/event.jpg",
    },
  ]);

  assert.equal(parsed[0]?.imageUrl, "/images/event.jpg");
});

test("accepts non-URL imageUrl strings for downstream fetch-layer validation", () => {
  const parsed = parseExtractedEventsFromModel([
    {
      title: "Abstract Showcase",
      // Intentionally accepted here; URL validation is delegated to the fetch layer.
      imageUrl: "not-a-url-at-all",
    },
  ]);

  assert.equal(parsed[0]?.imageUrl, "not-a-url-at-all");
});
