import test from "node:test";
import assert from "node:assert/strict";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";

test("computeArtworkCompleteness separates required and recommended issues", () => {
  const result = computeArtworkCompleteness({
    title: "",
    description: "short",
    medium: null,
    year: null,
    featuredAssetId: null,
    dimensions: null,
    provenance: null,
  }, 0);

  assert.equal(result.required.ok, false);
  assert.equal(result.required.issues.some((issue) => issue.code === "MISSING_TITLE"), true);
  assert.equal(result.required.issues.some((issue) => issue.code === "MISSING_IMAGE"), true);
  assert.equal(result.recommended.issues.some((issue) => issue.code === "MISSING_DESCRIPTION"), true);
  assert.equal(result.recommended.issues.some((issue) => issue.code === "MISSING_MEDIUM"), true);
  assert.equal(result.recommended.issues.some((issue) => issue.code === "MISSING_YEAR"), true);
});

test("computeArtworkCompleteness is ready when required fields are present", () => {
  const result = computeArtworkCompleteness({
    title: "Sunset",
    description: "A long enough description with many details.",
    medium: "Oil on canvas",
    year: 2022,
    featuredAssetId: null,
    dimensions: "50 x 70 cm",
    provenance: "Acquired directly from the artist",
  }, 1);

  assert.equal(result.required.ok, true);
  assert.equal(result.recommended.ok, true);
  assert.equal(result.scorePct, 100);
});
