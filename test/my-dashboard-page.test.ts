import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/my overview renders grouped status sections and totals", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  const groups = readFileSync("app/my/_components/StatusTileGroups.tsx", "utf8");

  assert.match(page, /StatusTileGroups/);
  assert.match(groups, /title="Venues"/);
  assert.match(groups, /title="Events"/);
  assert.match(groups, /title="Artwork"/);
  assert.match(groups, /Total:/);
  assert.match(groups, /makeDashboardTabHref\("\/my\/venues", status, venueId\)/);
  assert.match(groups, /makeDashboardTabHref\("\/my\/events", status, venueId\)/);
  assert.match(groups, /makeDashboardTabHref\("\/my\/artwork", status, venueId\)/);
});

test("/my venues quick list renders completeness bar and truncates missing list", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  const bar = readFileSync("app/my/_components/CompletenessBar.tsx", "utf8");

  assert.match(page, /venue\.completeness \? <CompletenessBar/);
  assert.match(bar, /% complete/);
  assert.match(bar, /missing\.slice\(0, 3\)/);
  assert.match(bar, /Missing:/);
});

test("/my includes section empty states", () => {
  const source = readFileSync("app/my/page.tsx", "utf8");
  assert.match(source, /You haven&apos;t created any venues yet/);
  assert.match(source, /You don&apos;t have any upcoming events yet/);
  assert.match(source, /You haven&apos;t added artwork yet/);
});

test("/my needs attention renders grouped headings and empty state", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  const panel = readFileSync("app/my/_components/NeedsAttentionPanel.tsx", "utf8");

  assert.match(page, /NeedsAttentionPanel attention=\{data\.attention\}/);
  assert.match(panel, /title: "Rejected"/);
  assert.match(panel, /title: "Pending review"/);
  assert.match(panel, /title: "Incomplete drafts"/);
  assert.match(panel, /title: "Team invites"/);
  assert.match(panel, /title: "Other"/);
  assert.match(panel, /Nothing needs attention — you&apos;re all caught up\./);
  assert.match(panel, /item\.ctaHref/);
});

test("/my needs attention sorts within groups and preserves CTA href", () => {
  const panel = readFileSync("app/my/_components/NeedsAttentionPanel.tsx", "utf8");
  assert.match(panel, /Date\.parse\(b\.updatedAtISO\) - Date\.parse\(a\.updatedAtISO\)/);
  assert.match(panel, /href=\{item\.ctaHref\}/);
  assert.match(panel, /\{item\.ctaLabel\}/);
});

test("header includes + Artwork and conditional artist profile CTA", () => {
  const header = readFileSync("app/my/_components/my-header-bar.tsx", "utf8");
  assert.match(header, /\+ Artwork/);
  assert.match(header, /!hasArtistProfile/);
  assert.match(header, /Create Artist Profile/);
});

test("/my layout includes shared shell components", () => {
  const layout = readFileSync("app/my/layout.tsx", "utf8");
  const header = readFileSync("app/my/_components/my-header-bar.tsx", "utf8");
  assert.match(layout, /MyShell/);
  assert.match(header, /Publisher Command Center/);
});
