import test from "node:test";
import assert from "node:assert/strict";
import { FeaturedWorksStrip } from "../components/artists/featured-works-strip.tsx";

test("FeaturedWorksStrip returns null for empty artworks", () => {
  const result = FeaturedWorksStrip({ artworks: [], onSelect: () => {} });
  assert.equal(result, null);
});
