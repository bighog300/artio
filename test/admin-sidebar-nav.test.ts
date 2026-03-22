import test from "node:test";
import assert from "node:assert/strict";
import { isRouteActive } from "../app/(admin)/admin/_components/admin-sidebar-nav-utils";
import { ADMIN_SECTIONS } from "../app/(admin)/admin/_components/admin-nav-sections";

function shouldShowBadge(count: number | null | undefined): boolean {
  return (count ?? 0) > 0;
}

test("isRouteActive marks nested admin routes active by segment", () => {
  assert.equal(isRouteActive("/admin/events/123", "/admin/events"), true);
  assert.equal(isRouteActive("/admin/events", "/admin/events"), true);
});

test("isRouteActive avoids false positives on similar prefixes", () => {
  assert.equal(isRouteActive("/admin/event", "/admin/events"), false);
  assert.equal(isRouteActive("/admin/events-archive", "/admin/events"), false);
});

test("badge shows for positive counts only", () => {
  assert.equal(shouldShowBadge(5), true);
  assert.equal(shouldShowBadge(1), true);
  assert.equal(shouldShowBadge(0), false);
  assert.equal(shouldShowBadge(null), false);
  assert.equal(shouldShowBadge(undefined), false);
});

test("every admin section has a non-empty label and at least one link", () => {
  for (const section of ADMIN_SECTIONS) {
    assert.ok(section.label.length > 0, "Section has empty label");
    assert.ok(section.links.length > 0, `Section "${section.label}" has no links`);
  }
});

test("no href appears in more than one admin section", () => {
  const seen = new Set<string>();
  for (const section of ADMIN_SECTIONS) {
    for (const link of section.links) {
      assert.ok(!seen.has(link.href), `Duplicate href "${link.href}" in section "${section.label}"`);
      seen.add(link.href);
    }
  }
});
