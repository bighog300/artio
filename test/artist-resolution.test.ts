import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { resolveArtistCandidate } from "../lib/ingest/artist-resolution";

type ArtistRecord = {
  id: string;
  name: string;
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  deletedAt?: Date | null;
};

function createDb(artists: ArtistRecord[]) {
  return {
    artist: {
      findFirst: async (args?: {
        where?: {
          name?: { equals?: string; mode?: "insensitive" | "default" };
          deletedAt?: null;
        };
        select?: { id?: boolean };
      }) => {
        const where = args?.where;
        const equals = where?.name?.equals;
        const mode = where?.name?.mode;

        const match = artists.find((artist) => {
          if (where?.deletedAt === null && artist.deletedAt != null) return false;
          if (!equals) return true;

          if (mode === "insensitive") {
            return artist.name.toLowerCase() === equals.toLowerCase();
          }

          return artist.name === equals;
        });

        if (!match) return null;
        return { id: match.id };
      },
      findMany: async (args?: {
        where?: {
          deletedAt?: null;
          websiteUrl?: { not: null };
          AND?: Array<{ name?: { contains?: string; mode?: "insensitive" | "default" } }>;
          OR?: Array<{ instagramUrl?: { not: null }; twitterUrl?: { not: null } }>;
        };
      }) => {
        const where = args?.where;

        return artists.filter((artist) => {
          if (where?.deletedAt === null && artist.deletedAt != null) return false;
          if (where?.websiteUrl?.not === null && artist.websiteUrl === null) return false;

          if (where?.AND && where.AND.length > 0) {
            const andMatch = where.AND.every((clause) => {
              const contains = clause.name?.contains;
              if (!contains) return true;

              if (clause.name?.mode === "insensitive") {
                return artist.name.toLowerCase().includes(contains.toLowerCase());
              }

              return artist.name.includes(contains);
            });

            if (!andMatch) return false;
          }

          if (where?.OR && where.OR.length > 0) {
            return where.OR.some((clause) => {
              if (clause.instagramUrl?.not === null) return artist.instagramUrl !== null;
              if (clause.twitterUrl?.not === null) return artist.twitterUrl !== null;
              return false;
            });
          }

          return true;
        });
      },
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
