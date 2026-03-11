import assert from "node:assert";
import test from "node:test";
import { createElement } from "react";
import EmailTemplate, { getSubject } from "@/lib/email/templates/new-user-welcome";
import { renderAsync } from "./render-async";

test("new-user-welcome email snapshot", async (t) => {
  const payload = { userName: "Maya Rivera" };
  const subject = getSubject();
  const { html, text } = await renderAsync(createElement(EmailTemplate, { userName: payload.userName }));

  assert.match(subject, /Welcome\ to\ Artio/i);
  assert.match(html, /Explore\ events/i);
  assert.ok(typeof html === "string" && html.length > 100, "html should be a non-empty string");
  assert.ok(typeof text === "string" && text.length > 0, "text should be a non-empty string");
});
