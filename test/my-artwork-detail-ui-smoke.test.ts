import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("artwork detail page renders stable detail signals", () => {
  const file = readFileSync("app/artwork/[key]/page.tsx", "utf8");

  // page loads and fetches artwork by route key
  assert.match(file, /export default async function ArtworkDetailPage/);
  assert.match(file, /db\.artwork\.findFirst\(/);

  // routing should support ID lookup and slug redirect
  assert.match(file, /isArtworkIdKey\(key\)/);
  assert.match(file, /shouldRedirectArtworkIdKey\(key, artwork\.slug\)/);
  assert.match(file, /permanentRedirect\(`\/artwork\/\$\{artwork\.slug\}`\)/);

  // heading should be tied to dynamic artwork title via EntityHeader
  assert.match(file, /<EntityHeader[^>]*title=\{artwork\.title\}/);

  // stable detail fields
  assert.match(file, /href=\{`\/artists\/\$\{artwork\.artist\.slug\}`\}/);
  assert.match(file, /const galleryImages = artwork\.images/);
  assert.match(file, /<EventGalleryLightbox images=\{galleryImages\} \/>/);
});
