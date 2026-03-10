import assert from "node:assert";
import test from "node:test";
import { createElement } from "react";
import EmailTemplate, { getSubject } from "@/lib/email/templates/artwork-inquiry-buyer";
import { renderAsync } from "./render-async";

test("artwork-inquiry-buyer email render smoke", async () => {
  const payload = { artworkTitle: "Blue Hour", artworkSlug: "blue-hour", artistName: "Alex", priceFormatted: "£1,200" };
  const subject = getSubject(payload);
  const { html, text } = await renderAsync(createElement(EmailTemplate, payload));

  assert.match(subject, /Blue Hour/i);
  assert.match(html, /View artwork/i);
  assert.ok(text.length > 0);
});
