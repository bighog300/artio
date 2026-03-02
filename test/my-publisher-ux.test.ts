import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/my/events/new preserves venue preselection from query when membership allows it", () => {
  const source = readFileSync("app/my/events/new/page.tsx", "utf8");
  assert.match(source, /const venueIdFromQuery = typeof params\?\.venueId === "string" \? params\.venueId : undefined/);
  assert.match(source, /defaultVenueId=\{preselectedVenueId\}/);
});

test("CreateVenueForm quickstart mode renders only name and city fields", () => {
  const source = readFileSync("app/my/venues/_components/CreateVenueForm.tsx", "utf8");
  const page = readFileSync("app/my/venues/new/page.tsx", "utf8");

  assert.match(source, /mode\?: "quickstart" \| "full"/);
  assert.match(source, /mode === "full" \? \(/);
  assert.match(source, /Venue name/);
  assert.match(source, /City \(optional\)/);
  assert.doesNotMatch(source, /Latitude \(optional\)/);
  assert.doesNotMatch(source, /Longitude \(optional\)/);
  assert.match(page, /CreateVenueForm showTopSubmit mode="quickstart"/);
  assert.match(page, /Create a venue/);
  assert.match(page, /Start with the basics — you can add photos, location, and details next\./);
});
