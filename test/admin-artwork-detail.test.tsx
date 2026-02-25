import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin artwork detail page includes danger zone controls", () => {
  const source = readFileSync("app/(admin)/admin/artwork/[id]/page.tsx", "utf8");
  assert.match(source, /Danger zone/);
  assert.match(source, /AdminArchiveActions/);
  assert.match(source, /AdminHardDeleteButton/);
  assert.match(source, /delete permanently/);
});
