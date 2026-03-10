import test from "node:test";
import assert from "node:assert/strict";
import { createArtworkInquiry } from "../lib/artwork-inquiry";

test("createArtworkInquiry succeeds with artist email delivery", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  const db = {
    artwork: {
      findFirst: async () => ({
        id: "art-1",
        title: "Blue Hour",
        slug: "blue-hour",
        priceAmount: 120000,
        currency: "GBP",
        artist: { name: "Alex Doe", user: { email: "artist@example.com" } },
      }),
    },
    artworkInquiry: {
      create: async () => ({ id: "inq-1" }),
    },
  };

  const result = await createArtworkInquiry({
    db: db as never,
    artworkId: "art-1",
    buyerName: "Buyer",
    buyerEmail: "buyer@example.com",
    message: "Interested",
    notify: async (args) => {
      notifications.push(args as never);
      return { deliveredTo: args.artistEmail ?? "" };
    },
  });

  assert.equal(result?.inquiryId, "inq-1");
  assert.equal(result?.deliveredTo, "artist@example.com");
  assert.equal(notifications.length, 1);
});

test("createArtworkInquiry supports fallback delivery routing", async () => {
  const result = await createArtworkInquiry({
    db: {
      artwork: {
        findFirst: async () => ({
          id: "art-2",
          title: "Untitled",
          slug: null,
          priceAmount: null,
          currency: null,
          artist: { name: "No Mail", user: null },
        }),
      },
      artworkInquiry: { create: async () => ({ id: "inq-2" }) },
    } as never,
    artworkId: "art-2",
    buyerName: "Buyer",
    buyerEmail: "buyer@example.com",
    notify: async () => ({ deliveredTo: "fallback@example.com" }),
  });

  assert.equal(result?.deliveredTo, "fallback@example.com");
});

test("createArtworkInquiry returns null for unpublished artwork", async () => {
  const result = await createArtworkInquiry({
    db: {
      artwork: { findFirst: async () => null },
      artworkInquiry: { create: async () => ({ id: "inq-3" }) },
    } as never,
    artworkId: "missing",
    buyerName: "Buyer",
    buyerEmail: "buyer@example.com",
    notify: async () => ({ deliveredTo: "x" }),
  });

  assert.equal(result, null);
});

test("createArtworkInquiry notify called once", async () => {
  let calls = 0;
  await createArtworkInquiry({
    db: {
      artwork: {
        findFirst: async () => ({
          id: "art-4",
          title: "Work",
          slug: "work",
          priceAmount: 100,
          currency: "GBP",
          artist: { name: "Artist", user: { email: "artist@example.com" } },
        }),
      },
      artworkInquiry: { create: async () => ({ id: "inq-4" }) },
    } as never,
    artworkId: "art-4",
    buyerName: "Buyer",
    buyerEmail: "buyer@example.com",
    notify: async () => {
      calls += 1;
      return { deliveredTo: "artist@example.com" };
    },
  });

  assert.equal(calls, 1);
});
