import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("event setup page renders sticky EventPublishPanel", () => {
  const page = readFileSync("app/my/events/[eventId]/page.tsx", "utf8");
  assert.match(page, /<EventPublishPanel/);
});

test("publish panel wires submit button disabled state to readiness", () => {
  const panel = readFileSync("app/my/_components/EventPublishPanel.tsx", "utf8");
  assert.match(panel, /isReady=\{checks\.readyToSubmit\}/);
});

test("location section shows fix venue location link when coords are missing", () => {
  const page = readFileSync("app/my/events/[eventId]/page.tsx", "utf8");
  assert.match(page, /Fix venue location/);
  assert.match(page, /\/my\/venues\/\$\{event\.venue\.id\}/);
});
