import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePatchMyArtist } from "@/lib/my-artist-route";
import { myArtistPatchSchema } from "@/lib/validators";
import { deriveArtistTags } from "@/app/artists/[slug]/page";

test("my artist patch returns forbidden when no owned artist", async () => {
  const req = new NextRequest("http://localhost/api/my/artist", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Updated" }),
  });

  const res = await handlePatchMyArtist(req, {
    requireAuth: async () => ({ id: "user-1" }),
    findOwnedArtistByUserId: async () => null,
    updateArtistById: async () => ({ id: "artist-1", name: "Updated", bio: null, websiteUrl: null, instagramUrl: null, avatarImageUrl: null, featuredAssetId: null, mediums: [] }),
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});


test("myArtistPatchSchema accepts a valid mediums array", () => {
  const parsed = myArtistPatchSchema.safeParse({ mediums: ["Oil", "Acrylic"] });

  assert.equal(parsed.success, true);
});

test("myArtistPatchSchema rejects a mediums array with more than 20 items", () => {
  const parsed = myArtistPatchSchema.safeParse({ mediums: Array.from({ length: 21 }, (_, i) => `Medium ${i}`) });

  assert.equal(parsed.success, false);
});

test("the artist detail page falls back to event tags when artist.mediums is empty", () => {
  const tags = deriveArtistTags([], [["painting", "abstract"], ["abstract", "oil"]]);

  assert.deepEqual(tags, ["painting", "abstract", "oil"]);
});

test("the artist detail page uses artist.mediums directly when the array is non-empty", () => {
  const tags = deriveArtistTags(["Sculpture", "Ceramics"], [["painting"], ["oil"]]);

  assert.deepEqual(tags, ["Sculpture", "Ceramics"]);
});
