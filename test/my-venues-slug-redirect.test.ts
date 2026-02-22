import test from "node:test";
import assert from "node:assert/strict";
import { isUuid, resolveVenueIdFromRouteParam } from "../app/my/venues/[id]/route-param";

test("isUuid only accepts canonical UUIDs", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("bristol-gallery"), false);
  assert.equal(isUuid("11111111-1111-1111-1111-111111111111"), false);
});

test("resolveVenueIdFromRouteParam returns same id for uuid params", async () => {
  let lookedUpSlug = false;
  const db = {
    venue: {
      findUnique: async () => {
        lookedUpSlug = true;
        return { id: "22222222-2222-4222-8222-222222222222" };
      },
    },
  };

  const resolved = await resolveVenueIdFromRouteParam("11111111-1111-4111-8111-111111111111", db as never);
  assert.deepEqual(resolved, { venueId: "11111111-1111-4111-8111-111111111111", redirected: false });
  assert.equal(lookedUpSlug, false);
});

test("resolveVenueIdFromRouteParam resolves slug to venue id for redirect", async () => {
  const db = {
    venue: {
      findUnique: async ({ where }: { where: { slug: string } }) => {
        assert.equal(where.slug, "bristol-gallery");
        return { id: "11111111-1111-4111-8111-111111111111" };
      },
    },
  };

  const resolved = await resolveVenueIdFromRouteParam("bristol-gallery", db as never);
  assert.deepEqual(resolved, { venueId: "11111111-1111-4111-8111-111111111111", redirected: true });
});

test("resolveVenueIdFromRouteParam returns null when slug does not match a venue", async () => {
  const db = {
    venue: {
      findUnique: async () => null,
    },
  };

  const resolved = await resolveVenueIdFromRouteParam("missing-venue", db as never);
  assert.equal(resolved, null);
});
