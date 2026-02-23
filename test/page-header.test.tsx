import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../components/ui/page-header";

test("PageHeader renders title subtitle and actions", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="Events"
      subtitle="Upcoming events near you"
      actions={<div data-testid="header-actions"><button type="button">Submit Venue for Review</button></div>}
    />,
  );

  assert.match(html, /Events/);
  assert.match(html, /Upcoming events near you/);
  assert.match(html, /data-testid="header-actions"/);
  assert.match(html, /Submit Venue for Review/);
});
