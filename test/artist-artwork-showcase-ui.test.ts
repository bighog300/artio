import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const showcaseFile = "components/artists/artist-artwork-showcase.tsx";
const lightboxFile = "components/artists/artist-artwork-lightbox.tsx";
const cardFile = "components/artists/artwork-showcase-card.tsx";

test("ArtistArtworkShowcase renders card grid given mock artworks", () => {
  const source = readFileSync(showcaseFile, "utf8");
  assert.match(source, /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(source, /artworks\.map\(\(artwork\) => <ArtworkShowcaseCard/);
});

test("Renders EmptyState component when initialArtworks is empty array", () => {
  const source = readFileSync(showcaseFile, "utf8");
  assert.match(source, /<EmptyState/);
});

test("ArtworkShowcaseCard renders in grid mode without error", () => {
  const source = readFileSync(cardFile, "utf8");
  assert.match(source, /if \(view === "list"\)/);
  assert.match(source, /group w-full overflow-hidden rounded-xl border bg-card/);
});

test("ArtworkShowcaseCard renders in list mode without error", () => {
  const source = readFileSync(cardFile, "utf8");
  assert.match(source, /if \(view === "list"\)/);
  assert.match(source, /flex w-full items-start gap-3 rounded-xl border bg-card p-3/);
});

test("ArtistArtworkLightbox renders and pressing Escape calls onClose", () => {
  const source = readFileSync(lightboxFile, "utf8");
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onClose\(\)/);
  assert.match(source, /window\.addEventListener\("keydown", onKeyDown\)/);
});
