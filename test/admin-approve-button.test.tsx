import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("AdminApproveButton calls shared admin submission approve endpoint", () => {
  const source = readFileSync("app/(admin)/admin/_components/AdminApproveButton.tsx", "utf8");
  assert.match(source, /fetch\(`\/api\/admin\/submissions\/\$\{submissionId\}\/approve`/);
  assert.match(source, /entityType: "venue" \| "event"/);
});

test("admin entity pages render moderation banner with reusable approve button", () => {
  const venuePage = readFileSync("app/(admin)/admin/venues/[id]/page.tsx", "utf8");
  const eventPage = readFileSync("app/(admin)/admin/events/[id]/page.tsx", "utf8");
  assert.match(venuePage, /<AdminApproveButton entityType="venue"/);
  assert.match(eventPage, /<AdminApproveButton entityType="event"/);
});
