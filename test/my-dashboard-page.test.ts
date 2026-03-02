import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/my overview renders status sections", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /<h2 className="text-lg font-semibold">Needs Attention<\/h2>/);
  assert.match(page, /<h2 className="text-lg font-semibold">In Review<\/h2>/);
  assert.match(page, /<h2 className="text-lg font-semibold">Published<\/h2>/);
});

test("/my overview renders creation CTAs", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /href="\/my\/events\/new"/);
  assert.match(page, /href="\/my\/venues\/new"/);
  assert.match(page, /href="\/my\/artist"/);
});

test("/my uses primary action helper for status-aware card CTA", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /getPrimaryAction\(item\.status/);
  assert.match(page, /<StatusBadge status=\{item\.status\} \/>/);
});

test("/my empty states remain explicit", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  assert.match(page, /No drafts need action right now\./);
  assert.match(page, /Nothing is currently in review\./);
  assert.match(page, /Publish something to see it here\./);
});
