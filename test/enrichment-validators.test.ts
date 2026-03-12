import test from "node:test";
import assert from "node:assert/strict";
import { parseOpeningHours, validateEmail, validateSocialUrl } from "../lib/ingest/enrichment-validators";

test("validateEmail returns normalized value for a valid email", () => {
  assert.equal(validateEmail("  hello@example.com  "), "hello@example.com");
});

test("validateEmail returns null for invalid email", () => {
  assert.equal(validateEmail("hello-at-example.com"), null);
});

test("validateSocialUrl accepts instagram.com host", () => {
  assert.equal(
    validateSocialUrl("https://www.instagram.com/artio", "instagram.com"),
    "https://www.instagram.com/artio",
  );
});

test("validateSocialUrl rejects random url with instagram only in path", () => {
  assert.equal(validateSocialUrl("https://example.com/instagram/profile", "instagram.com"), null);
});

test("validateSocialUrl accepts facebook.com and rejects twitter", () => {
  assert.equal(
    validateSocialUrl("https://facebook.com/artio", "facebook.com"),
    "https://facebook.com/artio",
  );
  assert.equal(validateSocialUrl("https://twitter.com/artio", "facebook.com"), null);
});

test("parseOpeningHours preserves raw and can return structured null", () => {
  const parsed = parseOpeningHours("Mon-Fri 10:00-18:00");
  assert.deepEqual(parsed, {
    raw: "Mon-Fri 10:00-18:00",
    structured: {
      Mon: { open: "10:00", close: "18:00" },
      Tue: { open: "10:00", close: "18:00" },
      Wed: { open: "10:00", close: "18:00" },
      Thu: { open: "10:00", close: "18:00" },
      Fri: { open: "10:00", close: "18:00" },
    },
  });

  const unparsed = parseOpeningHours("Open daily");
  assert.deepEqual(unparsed, {
    raw: "Open daily",
    structured: null,
  });
});
