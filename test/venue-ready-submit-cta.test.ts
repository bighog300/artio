import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("venue setup page renders publish panel CTA instead of header CTA", () => {
  const page = readFileSync("app/my/venues/[id]/page.tsx", "utf8");
  const panel = readFileSync("app/my/_components/VenuePublishPanel.tsx", "utf8");

  assert.match(page, /<VenuePublishPanel/);
  assert.doesNotMatch(page, /actions=\{\([\s\S]*VenueSubmitButton/);
  assert.match(panel, /<VenueSubmitButton/);
  assert.match(panel, /Publish venue/);
  assert.match(panel, /ctaLabel="Submit for review"/);
});


test("venue setup header uses explicit draft/submitted status descriptions", () => {
  const header = readFileSync("app/my/_components/VenueSetupHeader.tsx", "utf8");
  assert.match(header, /Draft — not yet submitted for admin approval\./);
  assert.match(header, /Submitted — in the Admin review queue\./);
  assert.match(header, /Published — visible on ArtPulse\./);
  assert.match(header, /Changes requested — fix issues and resubmit\./);
});
