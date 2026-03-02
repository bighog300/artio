import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("location section shows fix venue location link when coords are missing", () => {
  const page = readFileSync("app/my/events/[eventId]/page.tsx", "utf8");
  assert.match(page, /Fix venue location/);
  assert.match(page, /\/my\/venues\/\$\{event\.venue\.id\}/);
});


test("event setup page includes inline publish CTA", () => {
  const page = readFileSync("app/my/events/[eventId]/page.tsx", "utf8");
  assert.match(page, /Ready to publish\?/);
  assert.match(page, /href="#publish-panel"/);
});
