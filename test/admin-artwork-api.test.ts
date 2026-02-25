import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin artwork api route requires admin on patch and delete", () => {
  const source = readFileSync("app/api/admin/artwork/[id]/route.ts", "utf8");
  assert.match(source, /handleAdminEntityPatch\(req, "artwork"/);
  assert.match(source, /await requireAdmin\(\)/);
});

test("admin artwork delete includes foreign-key conflict guidance", () => {
  const source = readFileSync("app/api/admin/artwork/[id]/route.ts", "utf8");
  assert.match(source, /Cannot delete artwork due to related records\. Archive it instead or remove dependencies\./);
});
