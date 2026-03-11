import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import EmailTemplate from "@/lib/email/templates/rsvp-confirmation";
import { renderAsync } from "./email/render-async";

test("share links present in email output", async () => {
  const payload = {
    eventTitle: "After Hours Drawing",
    eventSlug: "after-hours-drawing",
    venueName: "Canal Arts Center",
    startAt: "2026-04-12T19:00:00.000Z",
    venueAddress: "58 Canal St, New York, NY",
    confirmationCode: "AP-2X9K",
  };

  const { html } = await renderAsync(createElement(EmailTemplate, payload));
  assert.match(html, /Share this event/i);
  assert.match(html, /https:\/\/x.com\/intent\/tweet\?/i);
  assert.match(html, /Copy link/i);
  assert.match(html, /https:\/\/artio.co\/events\//i);
});
