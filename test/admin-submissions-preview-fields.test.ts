import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin submissions query selects richer preview fields", () => {
  const source = readFileSync("app/(admin)/admin/submissions/page.tsx", "utf8");
  assert.match(source, /targetEvent: \{ select: \{ id: true, title: true, slug: true, startAt: true, eventType: true/);
  assert.match(source, /targetVenue: \{ select: \{ id: true, name: true, slug: true, city: true, country: true, claimStatus: true, aiGenerated: true/);
  assert.match(source, /images: \{ select: \{ id: true, url: true, alt: true \}, take: 4/);
});
