import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("venue setup renders created=draft banner with explicit draft/submission copy", () => {
  const page = readFileSync("app/my/venues/[id]/page.tsx", "utf8");
  const createForm = readFileSync("app/my/venues/_components/CreateVenueForm.tsx", "utf8");
  const banner = readFileSync("app/my/_components/VenueCreatedDraftBanner.tsx", "utf8");

  assert.match(createForm, /\?created=1/);
  assert.match(page, /query\.created === "1"/);
  assert.match(page, /VenueCreatedDraftBanner/);
  assert.match(banner, /Venue created \(Draft\)/);
  assert.match(banner, /not yet in the Admin review queue/);
  assert.match(banner, /Submit for review/);
});

test("created banner clears one-time query param with router.replace", () => {
  const banner = readFileSync("app/my/_components/VenueCreatedDraftBanner.tsx", "utf8");
  assert.match(banner, /router\.replace\(trimmedQuery, \{ scroll: false \}\)/);
});
