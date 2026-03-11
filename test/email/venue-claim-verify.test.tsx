import assert from "node:assert";
import test from "node:test";
import { createElement } from "react";
import EmailTemplate, { getSubject } from "@/lib/email/templates/venue-claim-verify";
import { renderAsync } from "./render-async";

test("venue-claim-verify email snapshot", async (t) => {
  const payload = { venueName: "Harbor Light Gallery", verifyUrl: "https://artio.co/claims/verify/abc" };
  const subject = getSubject(payload as never);
  const { html, text } = await renderAsync(createElement(EmailTemplate, payload));

  assert.match(subject, /Harbor\ Light\ Gallery/i);
  assert.match(html, /Verify\ claim/i);
  assert.ok(typeof html === "string" && html.length > 100, "html should be a non-empty string");
  assert.ok(typeof text === "string" && text.length > 0, "text should be a non-empty string");
});
