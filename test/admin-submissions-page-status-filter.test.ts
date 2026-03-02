import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(admin)/admin/submissions/page.tsx", "utf8");

test("status tabs whitelist and fallback to IN_REVIEW", () => {
  assert.match(source, /const allowedStatuses = \["IN_REVIEW", "APPROVED", "REJECTED"\] as const/);
  assert.match(source, /const inputStatus = typeof resolved\.status === "string" \? resolved\.status : "IN_REVIEW"/);
  assert.match(source, /const status: StatusFilter = allowedStatuses\.includes\(inputStatus as StatusFilter\) \? \(inputStatus as StatusFilter\) : "IN_REVIEW"/);
});

test("status tab links preserve type filter", () => {
  assert.match(source, /href=\{`\/admin\/submissions\?status=\$\{s\}&type=\$\{type\}`\}/);
  assert.match(source, /className=\{`rounded border px-3 py-1 \$\{s === status \? "bg-neutral-100" : ""\}`\}/);
});

test("query filters by status before rendering moderation list", () => {
  assert.match(source, /where: \{ status, \.\.\.\(type === "ALL" \? \{\} : \{ type \}\) \}/);
});
