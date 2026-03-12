import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { resolveArtistCandidate } from "../lib/ingest/artist-resolution";

function createDb(artists: Array<{
  id: string;
  name: string;
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
}>) {
  return {
    artist: {
      findMany: async () => artists,
    },
  } as unknown as PrismaClient;
}

test("resolveArtistCandidate returns exact name match artist id", async () => {
  const db = createDb([
    {
      id: "artist-1",
      name: "John    Smith",
      websiteUrl: null,
      instagramUrl: null,
      twitterUrl: null,
    },
  ]);

  const result = await resolveArtistCandidate({
    db,
    name: "  john smith ",
  });

  assert.deepEqual(result, { artistId: "artist-1", matchType: "exact_name" });
});

test("resolveArtistCandidate matches instagram handle regardless of trailing slash", async () => {
  const db = createDb([
    {
      id: "artist-2",
      name: "Other Name",
      websiteUrl: null,
      instagramUrl: "https://instagram.com/jsmith/",
      twitterUrl: null,
    },
  ]);

  const result = await resolveArtistCandidate({
    db,
    name: "Unknown",
    instagramUrl: "https://instagram.com/jsmith",
  });

  assert.deepEqual(result, { artistId: "artist-2", matchType: "social_handle" });
});

test("resolveArtistCandidate matches on website host across protocol and www differences", async () => {
  const db = createDb([
    {
      id: "artist-3",
      name: "Other Name",
      websiteUrl: "https://www.jsmith.com",
      instagramUrl: null,
      twitterUrl: null,
    },
  ]);

  const result = await resolveArtistCandidate({
    db,
    name: "No Match",
    websiteUrl: "http://jsmith.com",
  });

  assert.deepEqual(result, { artistId: "artist-3", matchType: "website_host" });
});

test("resolveArtistCandidate returns null when no match exists", async () => {
  const db = createDb([
    {
      id: "artist-4",
      name: "Completely Different",
      websiteUrl: "https://different.com",
      instagramUrl: "https://instagram.com/different",
      twitterUrl: "https://x.com/different",
    },
  ]);

  const result = await resolveArtistCandidate({
    db,
    name: "No Match",
    websiteUrl: "https://nomatch.com",
    instagramUrl: "https://instagram.com/nomatch",
    twitterUrl: "https://x.com/nomatch",
  });

  assert.equal(result, null);
});

test("resolveArtistCandidate handles null social fields without crashing", async () => {
  const db = createDb([
    {
      id: "artist-5",
      name: "Null Social",
      websiteUrl: null,
      instagramUrl: null,
      twitterUrl: null,
    },
  ]);

  const result = await resolveArtistCandidate({
    db,
    name: "Unmatched",
    instagramUrl: null,
    twitterUrl: null,
  });

  assert.equal(result, null);
});
