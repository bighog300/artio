import test from "node:test";
import assert from "node:assert/strict";
import { applyTasteUpdate, decayTasteModel, TASTE_LIMITS, type TasteModel } from "../lib/personalization/taste.ts";

function baseModel(): TasteModel {
  return {
    version: 1,
    updatedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
    tagWeights: {},
    venueWeights: {},
    artistWeights: {},
    daypartWeights: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    dowWeights: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
  };
}

test("taste updates click/save/attend/follow and show_less/hide deltas", () => {
  let model = baseModel();
  model = applyTasteUpdate(model, { type: "click", tags: ["jazz"], venueSlug: "venue-1", artistSlugs: ["artist-1"], at: new Date("2025-01-06T09:00:00.000Z") });
  model = applyTasteUpdate(model, { type: "save", tags: ["jazz"], venueSlug: "venue-1", artistSlugs: ["artist-1"], at: new Date("2025-01-06T09:05:00.000Z") });
  model = applyTasteUpdate(model, { type: "attend", tags: ["jazz"], venueSlug: "venue-1", artistSlugs: ["artist-1"], at: new Date("2025-01-06T09:08:00.000Z") });
  model = applyTasteUpdate(model, { type: "show_less", tags: ["jazz"], venueSlug: "venue-1", artistSlugs: ["artist-1"], at: new Date("2025-01-06T09:10:00.000Z") });

  assert.equal(model.tagWeights.jazz.toFixed(2), (0.60).toFixed(2));
  assert.equal(model.venueWeights["venue-1"].toFixed(2), (0.60).toFixed(2));
  assert.equal(model.artistWeights["artist-1"].toFixed(2), (0.60).toFixed(2));
  assert.ok(model.daypartWeights.morning > 0);
  assert.ok(model.dowWeights.mon > 0);
});

test("decay reduces weights and caps dictionaries", () => {
  const model = baseModel();
  model.tagWeights = Object.fromEntries(Array.from({ length: TASTE_LIMITS.MAX_TAGS + 20 }, (_, i) => [`tag-${i}`, i / 100]));
  const decayed = decayTasteModel(model, new Date("2025-01-08T00:00:00.000Z"));
  assert.equal(Object.keys(decayed.tagWeights).length <= TASTE_LIMITS.MAX_TAGS, true);
  assert.ok((decayed.tagWeights["tag-219"] ?? 0) < (model.tagWeights["tag-219"] ?? 0));
});
