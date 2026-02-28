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

test("/my venues quick list renders completeness bar and onboarding callout gating", () => {
  const page = readFileSync("app/my/page.tsx", "utf8");
  const bar = readFileSync("app/my/_components/CompletenessBar.tsx", "utf8");

  assert.match(page, /venue\.completeness \? <CompletenessBar/);
  assert.match(bar, /% complete/);
  assert.match(bar, /missing\.slice\(0, 3\)/);
  assert.match(bar, /Missing:/);
  assert.match(page, /const shouldShowOnboarding = data\.quickLists\.venues\.length === 0 && data\.quickLists\.upcomingEvents\.length === 0/);
  assert.match(page, /Get set up/);
  assert.match(page, /Create your venue/);
  assert.match(page, /Add images and location details/);
  assert.match(page, /Create your first event/);
  assert.match(page, /Submit for review/);
});

test("/my venue cards use status-aware primary CTAs", () => {
  const source = readFileSync("app/my/page.tsx", "utf8");
  assert.match(source, /label: "Complete profile"/);
  assert.match(source, /label: "Submit for review"/);
  assert.match(source, /label: "Pending review"/);
  assert.match(source, /label: "\+ New event"/);
  assert.match(source, /label: "Fix & resubmit"/);
  assert.match(source, /href: `\/my\/events\/new\?venueId=\$\{venue\.id\}`/);
  assert.doesNotMatch(source, /\/submit-event/);
  assert.match(source, /Edit venue/);
  assert.match(source, /View events/);
  assert.match(source, /href=\{`\/my\/events\?venueId=\$\{venue\.id\}`\}>View events</);
});

test("/my includes section empty states", () => {
  const source = readFileSync("app/my/page.tsx", "utf8");
  assert.match(source, /You haven&apos;t created any venues yet/);
  assert.match(source, /You don&apos;t have any upcoming events yet/);
  assert.match(source, /You haven&apos;t added artwork yet/);
});

test("/my overview uses in-process dashboard builder (no internal HTTP fetch)", () => {
  const source = readFileSync("app/my/page.tsx", "utf8");
  assert.match(source, /getMyDashboard\(\{ userId: dbUser\?\.id \?\? user\.id, venueId \}\)/);
  assert.doesNotMatch(source, /\/api\/my\/dashboard/);
  assert.doesNotMatch(source, /getServerBaseUrl/);
  assert.doesNotMatch(source, /fetch\(/);
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
  assert.match(panel, /const bSortKey = b\.updatedAtISO \?\? b\.createdAtISO/);
  assert.match(panel, /const aSortKey = a\.updatedAtISO \?\? a\.createdAtISO/);
  assert.match(panel, /href=\{item\.ctaHref\}/);
  assert.match(panel, /\{item\.ctaLabel\}/);
});

test("header includes contextual + Event link and artist profile CTA", () => {
  const header = readFileSync("app/my/_components/my-header-bar.tsx", "utf8");
  assert.match(header, /const venueId = searchParams\.get\("venueId"\) \?\? ""/);
  assert.match(header, /href=\{venueId \? `\/my\/events\/new\?venueId=\$\{encodeURIComponent\(venueId\)\}` : "\/my\/events\/new"\}/);
  assert.match(header, /\+ Artwork/);
  assert.match(header, /!hasArtistProfile/);
  assert.match(header, /Create Artist Profile/);
  assert.match(header, /Unable to load dashboard \(invalid response\)\./);
});

test("my sub-nav renders primary and secondary groups", () => {
  const source = readFileSync("app/my/_components/my-sub-nav.tsx", "utf8");
  assert.match(source, /const primaryTabs = \[/);
  assert.match(source, /const secondaryTabs = \[/);
  assert.match(source, /tone: "primary" \| "secondary"/);
  assert.match(source, /bg-muted\/60 text-muted-foreground/);
});

test("/my layout includes shared shell components", () => {
  const layout = readFileSync("app/my/layout.tsx", "utf8");
  const header = readFileSync("app/my/_components/my-header-bar.tsx", "utf8");
  assert.match(layout, /MyShell/);
  assert.match(header, /Publisher Command Center/);
});
