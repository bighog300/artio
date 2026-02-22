import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/my dashboard page includes key publisher actions", () => {
  const source = readFileSync("app/my/page.tsx", "utf8");
  assert.match(source, /Publisher Dashboard/);
  assert.match(source, /\+ Add artwork/);
  assert.match(source, /\+ Create event/);
  assert.match(source, /\+ Create venue/);
  assert.match(source, /View analytics/);
});

test("dashboard client renders venues empty-state CTA", () => {
  const source = readFileSync("components/my/my-dashboard-client.tsx", "utf8");
  assert.match(source, /My venues/);
  assert.match(source, /Create your first venue/);
  assert.match(source, /\+ Create venue/);
  assert.match(source, /venuesNewHref/);
});

test("dashboard client renders venue rows and view-all link", () => {
  const source = readFileSync("components/my/my-dashboard-client.tsx", "utf8");
  assert.match(source, /entities\.venues\.map/);
  assert.match(source, /View all venues/);
  assert.match(source, /\/my\/venues\/\$\{venue\.id\}/);
});
