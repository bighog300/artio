import test from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, getPlatformPromptHint, isJsRenderedPlatform } from "@/lib/ingest/detect-platform";

test("detectPlatform detects URL signals", () => {
  assert.equal(detectPlatform("<html></html>", "https://www.eventbrite.com/o/gallery-123/"), "eventbrite");
  assert.equal(detectPlatform("<html></html>", "https://www.eventbrite.co.uk/e/event-456/"), "eventbrite");
  assert.equal(detectPlatform("<html></html>", "https://galleryx.artlogic.net/exhibitions"), "artlogic");
});

test("detectPlatform detects HTML signals", () => {
  assert.equal(detectPlatform("<script src='https://static.wixstatic.com/app.js'></script>", "https://example.com"), "wix");
  assert.equal(detectPlatform("<script src='https://static.squarespace.com/app.js'></script>", "https://example.com"), "squarespace");
  assert.equal(detectPlatform("<link href='https://assets.webflow.io/x.css' />", "https://example.com"), "webflow");
  assert.equal(detectPlatform('<meta name="generator" content="Webflow">', "https://example.com"), "webflow");
  assert.equal(detectPlatform("<img src='https://cdn.framerusercontent.com/asset.png' />", "https://example.com"), "framer");
  assert.equal(detectPlatform("<html></html>", "https://gallery.cargo.site/"), "cargo");
  assert.equal(detectPlatform("<link href='/wp-content/themes/site/style.css' />", "https://example.com"), "wordpress");
  assert.equal(detectPlatform("<script src='/wp-includes/js/jquery.js'></script>", "https://example.com"), "wordpress");
  assert.equal(detectPlatform("<html><body>plain</body></html>", "https://example.com"), "unknown");
});

test("detectPlatform prioritizes URL over HTML", () => {
  const html = "<link href='/wp-content/themes/site/style.css' />";
  assert.equal(detectPlatform(html, "https://www.eventbrite.com/o/gallery-123/"), "eventbrite");
});

test("getPlatformPromptHint returns expected values", () => {
  assert.match(getPlatformPromptHint("artlogic") ?? "", /Artlogic/);
  assert.match(getPlatformPromptHint("squarespace") ?? "", /Squarespace/);
  assert.match(getPlatformPromptHint("wordpress") ?? "", /WordPress/);
  assert.equal(getPlatformPromptHint("wix"), null);
  assert.equal(getPlatformPromptHint("framer"), null);
  assert.equal(getPlatformPromptHint("unknown"), null);
});

test("isJsRenderedPlatform flags wix and framer", () => {
  assert.equal(isJsRenderedPlatform("wix"), true);
  assert.equal(isJsRenderedPlatform("framer"), true);
  assert.equal(isJsRenderedPlatform("artlogic"), false);
  assert.equal(isJsRenderedPlatform("squarespace"), false);
  assert.equal(isJsRenderedPlatform("unknown"), false);
});
