import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("legacy venue submit-event page redirects to venue-scoped events list", () => {
  const source = readFileSync("app/my/venues/[id]/submit-event/page.tsx", "utf8");
  assert.match(source, /redirect\(`/);
  assert.match(source, /\/my\/events\?/);
  assert.match(source, /query\.set\("venueId", id\)/);
});

test("admin moderation page renders moderation client directly", () => {
  const source = readFileSync("app/(admin)/admin/moderation/page.tsx", "utf8");
  assert.match(source, /<ModerationClient/);
  assert.doesNotMatch(source, /redirect\("\/admin\/submissions"\)/);
});
