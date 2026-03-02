import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("venue setup page renders generic publish panel", () => {
  const page = readFileSync("app/my/venues/[id]/page.tsx", "utf8");

  assert.match(page, /<PublishPanel/);
  assert.match(page, /resourceType="venue"/);
  assert.match(page, /href="#publish-panel"/);
});

test("venue setup header uses status-label driven copy", () => {
  const header = readFileSync("app/my/_components/VenueSetupHeader.tsx", "utf8");
  assert.match(header, /getPublisherStatusLabel/);
  assert.match(header, /This listing is visible publicly\./);
  assert.match(header, /Your listing is in moderation\./);
  assert.match(header, /Please fix required items, then publish again\./);
  assert.match(header, /This listing is not public yet\./);
});

test("venue setup page includes publish-ready banner and publish panel jump", () => {
  const page = readFileSync("app/my/venues/[id]/page.tsx", "utf8");
  assert.match(page, /This venue is ready to publish\./);
  assert.match(page, /href="#publish-panel"/);
});
