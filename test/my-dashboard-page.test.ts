import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/my overview delegates status sections to dashboard components", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /import NeedsAttentionPanel from "@\/app\/my\/_components\/NeedsAttentionPanel";/);
  assert.match(page, /import StatusTileGroups from "@\/app\/my\/_components\/StatusTileGroups";/);
  assert.match(page, /<NeedsAttentionPanel attention=\{data\.attention\} \/>/);
  assert.match(page, /<StatusTileGroups counts=\{data\.counts\} venueId=\{venueId\} \/>/);
});

test("/my overview remains authenticated and venue-scoped", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /if \(!user\) redirectToLogin\("\/my"\);/);
  assert.match(page, /const rawVenueId = params\.venueId;/);
  assert.match(page, /const venueId = rawVenueId && rawVenueId\.trim\(\)\.length > 0 \? rawVenueId : undefined;/);
  assert.match(page, /const data = await getMyDashboard\(\{ userId: user\.id, venueId \}\);/);
});
