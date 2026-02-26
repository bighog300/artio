import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getVenueCompletionChecks } from "../lib/venues/venue-completion";

test("location-missing and image-missing checks disable publish readiness", () => {
  const checks = getVenueCompletionChecks({
    name: "Venue",
    description: "Great space",
    lat: null,
    lng: null,
    images: [],
    websiteUrl: null,
    instagramUrl: null,
  });

  assert.equal(checks.location, false);
  assert.equal(checks.images, false);
  assert.equal(checks.publishReady, false);
  assert.deepEqual(checks.missingRequired, [
    "Confirm location (lat/lng)",
    "Add at least 1 image",
  ]);
});

test("venue setup page renders location missing banner in Location section", () => {
  const page = readFileSync("app/my/venues/[id]/page.tsx", "utf8");

  assert.match(page, /VenueSetupSection title="Location"/);
  assert.match(page, /<VenueLocationMissingBanner venueId=\{venue\.id\} \/>/);
});

test("publish panel shows images requirement and submit button readiness wiring", () => {
  const panel = readFileSync("app/my/_components/VenuePublishPanel.tsx", "utf8");

  assert.match(panel, /What\&apos;s missing/);
  assert.match(panel, /checks\.missingRequired\.map/);
  assert.match(panel, /Ready to submit for admin approval/);
  assert.match(panel, /Awaiting review \(Admin queue\)/);
  assert.match(panel, /isReady=\{checks\.publishReady && isOwner\}/);
});
