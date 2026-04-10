import test from "node:test";
import assert from "node:assert/strict";
import { buildArtistSearchQuery } from "@/lib/ingest/artist-discovery";

test("buildArtistSearchQuery leaves long names uncontextualized", () => {
  assert.equal(buildArtistSearchQuery({ artistName: "Jean-Michel Basquiat" }), "Jean-Michel Basquiat artist");
});

test("buildArtistSearchQuery adds venue context for short names", () => {
  assert.equal(
    buildArtistSearchQuery({ artistName: "Jo Spence", venueName: "Whitechapel Gallery" }),
    '"Jo Spence" artist Whitechapel Gallery',
  );
});

test("buildArtistSearchQuery adds event title context when venue missing", () => {
  assert.equal(
    buildArtistSearchQuery({ artistName: "Jo Spence", eventTitle: "Retrospective Night" }),
    '"Jo Spence" artist Retrospective Night',
  );
});

test("buildArtistSearchQuery falls back to plain query with no context", () => {
  assert.equal(buildArtistSearchQuery({ artistName: "Jo Spence" }), "Jo Spence artist");
});
