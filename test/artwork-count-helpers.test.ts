import assert from "node:assert/strict";
import test from "node:test";
import { countAllArtworksByArtist, countPublishedArtworksByArtist, countPublishedArtworksByEvent, countPublishedArtworksByVenue } from "@/lib/artworks";

test("count helpers apply published and relation filters", async () => {
  const calls: unknown[] = [];
  const deps = {
    count: async (args: unknown) => {
      calls.push(args);
      return 5;
    },
  };

  await countPublishedArtworksByArtist("artist-1", deps);
  await countPublishedArtworksByVenue("venue-1", deps);
  await countPublishedArtworksByEvent("event-1", deps);
  await countAllArtworksByArtist("artist-1", deps);

  assert.deepEqual(calls[0], { where: { artistId: "artist-1", isPublished: true, deletedAt: null } });
  assert.deepEqual(calls[1], { where: { isPublished: true, deletedAt: null, venues: { some: { venueId: "venue-1" } } } });
  assert.deepEqual(calls[2], { where: { isPublished: true, deletedAt: null, events: { some: { eventId: "event-1" } } } });
  assert.deepEqual(calls[3], { where: { artistId: "artist-1" } });
});
