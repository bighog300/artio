import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveFiltersBar } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref } from "@/app/my/_components/filter-href";
import { makeDashboardTabHref } from "@/app/my/_components/dashboard-tab-href";
import { resolveVenueFilterLabel } from "@/app/my/events/page";

test("status=draft renders Status pill label", () => {
  const html = renderToStaticMarkup(
    <ActiveFiltersBar
      pills={[{ key: "status", label: "Status: Draft", value: "draft", removeHref: "/my/events" }]}
      clearAllHref="/my/events"
    />,
  );

  assert.match(html, /Status: Draft/);
  assert.match(html, /Filters:/);
});

test("remove pill href drops target filter and pagination params", () => {
  const href = buildRemoveFilterHref(
    "/my/artwork",
    { status: "draft", q: "sculpture", sort: "title", venueId: "venue_1", cursor: "abc123", page: "4" },
    ["status"],
  );

  assert.equal(href, "/my/artwork?q=sculpture&sort=title&venueId=venue_1");
  assert.doesNotMatch(href, /cursor=/);
  assert.doesNotMatch(href, /page=/);
});

test("clear filters href removes filter and pagination params but preserves venue scope", () => {
  const href = buildClearFiltersHref(
    "/my/events",
    { status: "draft", query: "opening", sort: "updated", dateFrom: "2026-02-01", dateTo: "2026-02-28", venueId: "venue_1", page: "4", cursor: "cursor_1" },
    ["status", "q", "query", "sort", "dateFrom", "dateTo"],
    ["venueId"],
  );

  assert.equal(href, "/my/events?venueId=venue_1");
  assert.doesNotMatch(href, /cursor=/);
  assert.doesNotMatch(href, /page=/);
});



test("dashboard tab href does not carry pagination params", () => {
  const href = makeDashboardTabHref("/my/events", "Draft", "venue_1");

  assert.equal(href, "/my/events?status=Draft&venueId=venue_1");
  assert.doesNotMatch(href, /cursor=/);
  assert.doesNotMatch(href, /page=/);
});

test("bar does not render when no active filters", () => {
  const html = renderToStaticMarkup(<ActiveFiltersBar pills={[]} clearAllHref="/my/venues" />);
  assert.equal(html, "");
});

test("venue filter label resolves venue name and avoids raw venue id", () => {
  const venueId = "de8407ee-b2be-4e1a-a4cb-0c33ab560d78";
  const label = resolveVenueFilterLabel(venueId, [{ id: venueId, name: "Gallery X" }]);

  assert.equal(label, "Venue: Gallery X");
  assert.doesNotMatch(label, /de8407ee-b2be-4e1a-a4cb-0c33ab560d78/);
});

test("venue filter label falls back when venue id is not found", () => {
  const label = resolveVenueFilterLabel("missing-venue", [{ id: "venue_1", name: "Gallery X" }]);

  assert.equal(label, "Venue: Selected venue");
});
