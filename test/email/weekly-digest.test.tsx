import assert from "node:assert";
import test from "node:test";
import { createElement } from "react";
import EmailTemplate, { getSubject } from "@/lib/email/templates/weekly-digest";
import { renderAsync } from "./render-async";

test("weekly-digest email snapshot", async (t) => {
  const payload = {
    digestUrl: "https://artio.co/digest/week-12",
    events: [
      { title: "Color Study", date: "Fri, Mar 14 · 7:00 PM", venue: "Atlas Gallery" },
      { title: "Night Forms", date: "Sat, Mar 15 · 8:30 PM", venue: "Pier Studio" },
    ],
  };
  const subject = getSubject();
  const { html, text } = await renderAsync(createElement(EmailTemplate, { digestUrl: payload.digestUrl, events: payload.events }));

  assert.match(subject, /weekly\ Artio\ digest/i);
  assert.match(html, /View\ digest/i);
  assert.ok(typeof html === "string" && html.length > 100, "html should be a non-empty string");
  assert.ok(typeof text === "string" && text.length > 0, "text should be a non-empty string");
});
