import assert from "node:assert";
import test from "node:test";
import { createElement } from "react";
import EmailTemplate, { getSubject } from "@/lib/email/templates/artwork-inquiry-artist";
import { renderAsync } from "./render-async";

test("artwork-inquiry-artist email render smoke", async () => {
  const payload = {
    artworkTitle: "Blue Hour",
    artworkSlug: "blue-hour",
    buyerName: "Buyer Name",
    buyerEmail: "buyer@example.com",
    message: "I love this piece.",
    priceFormatted: "£1,200",
  };
  const subject = getSubject(payload);
  const { html, text } = await renderAsync(createElement(EmailTemplate, payload));

  assert.match(subject, /Blue Hour/i);
  assert.match(html, /Reply to Buyer Name/i);
  assert.ok(text.length > 0);
});
