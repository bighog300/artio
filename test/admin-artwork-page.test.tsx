import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin artwork page renders header and edit action", () => {
  const pageSource = readFileSync("app/(admin)/admin/artwork/page.tsx", "utf8");
  const listSource = readFileSync("app/(admin)/admin/artwork/admin-artwork-list-client.tsx", "utf8");
  assert.match(pageSource, /AdminPageHeader title="Artwork"/);
  assert.match(listSource, />Edit</);
  assert.match(listSource, /\/admin\/artwork\/\$\{item\.id\}/);
});

test("admin sidebar includes artwork link", () => {
  const layoutSource = readFileSync("app/(admin)/admin/layout.tsx", "utf8");
  assert.match(layoutSource, /href: "\/admin\/artwork", label: "Artwork"/);
});
