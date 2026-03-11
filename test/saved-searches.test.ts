import test from "node:test";
import assert from "node:assert/strict";
import { canAccessSavedSearch } from "../lib/ownership.ts";
import { digestDedupeKey, isoWeekStamp } from "../lib/digest.ts";
import { normalizeSavedSearchParams, previewSavedSearch, runSavedSearchEvents, savedSearchParamsSchema } from "../lib/saved-searches.ts";
import { runWeeklyDigests } from "../lib/cron-digests.ts";
import { canSaveFromPreview } from "../components/saved-searches/save-search-button.tsx";

test("user scoping prevents access to other users saved searches", () => {
  assert.equal(canAccessSavedSearch("user-1", "user-2"), false);
  assert.equal(canAccessSavedSearch("user-1", "user-1"), true);
});

test("saved search params normalize and clamp schema", () => {
  const nearby = normalizeSavedSearchParams("NEARBY", { lat: 10, lng: 20, radiusKm: 500, days: 30, tags: ["art"] });
  assert.equal(nearby.radiusKm, 200);
  const filtered = normalizeSavedSearchParams("EVENTS_FILTER", { q: "painting", tags: ["modern"] });
  assert.equal(filtered.q, "painting");
  assert.deepEqual(filtered.tags, ["modern"]);
  const artwork = normalizeSavedSearchParams("ARTWORK", { query: "blue", medium: ["Painting"], sort: "VIEWS_30D_DESC" });
  assert.equal((artwork as any).provider, "ARTWORKS");
});

test("digest dedupe key stable by iso week", () => {
  const d = new Date("2026-02-09T10:00:00.000Z");
  assert.equal(isoWeekStamp(d), "2026-W07");
  assert.equal(digestDedupeKey("abc", d), "digest:abc:2026-W07");
});

test("cron secret enforcement returns 401/500", async () => {
  delete process.env.CRON_SECRET;
  const misconfigured = await runWeeklyDigests("x", null, { savedSearch: {} as never, digestRun: {} as never, notification: {} as never, event: {} as never });
  assert.equal(misconfigured.status, 500);
  process.env.CRON_SECRET = "secret";
  const unauthorized = await runWeeklyDigests("bad", null, { savedSearch: {} as never, digestRun: {} as never, notification: {} as never, event: {} as never });
  assert.equal(unauthorized.status, 401);
});

test("digest worker upserts digest run idempotently, href points to digest page, updates lastSentAt only for results", async () => {
  process.env.CRON_SECRET = "secret";
  let updated = 0;
  let notificationCalls = 0;
  let digestRunCalls = 0;
  const runs = new Map<string, { id: string; savedSearchId: string; periodKey: string }>();
  let lastHref = "";

  const db = {
    savedSearch: {
      findMany: async () => ([
        {
          id: "s1",
          userId: "u1",
          name: "Has results",
          type: "EVENTS_FILTER" as const,
          paramsJson: { q: "x" },
          lastSentAt: null,
          user: {
            digestEnabled: true,
            digestEventsOnly: false,
            digestRadiusKm: null,
            digestMaxEvents: 10,
            locationLat: null,
            locationLng: null,
          },
        },
        {
          id: "s2",
          userId: "u1",
          name: "No results",
          type: "EVENTS_FILTER" as const,
          paramsJson: { q: "none" },
          lastSentAt: null,
          user: {
            digestEnabled: true,
            digestEventsOnly: false,
            digestRadiusKm: null,
            digestMaxEvents: 10,
            locationLat: null,
            locationLng: null,
          },
        },
      ]),
      update: async () => { updated += 1; return {}; },
    },
    digestRun: {
      upsert: async (args: any) => {
        digestRunCalls += 1;
        const key = `${args.where.savedSearchId_periodKey.savedSearchId}:${args.where.savedSearchId_periodKey.periodKey}`;
        if (!runs.has(key)) runs.set(key, { id: "dr-1", savedSearchId: "s1", periodKey: args.where.savedSearchId_periodKey.periodKey });
        return { id: runs.get(key)!.id };
      },
    },
    notification: {
      upsert: async (args: any) => { notificationCalls += 1; lastHref = args.create.href; return {}; },
    },
    event: {
      findMany: async (args: any) => (JSON.stringify(args.where).includes("none") ? [] : [{ id: "e1", title: "T", slug: "t", startAt: new Date(), lat: null, lng: null, venue: null, eventTags: [] }]),
    },
  };

  const res1 = await runWeeklyDigests("secret", null, db as never);
  const res2 = await runWeeklyDigests("secret", null, db as never);
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(digestRunCalls, 2);
  assert.equal(runs.size, 1);
  assert.equal(notificationCalls, 2);
  assert.equal(updated, 2);
  assert.equal(lastHref, "/digests/dr-1");
});

test("preview validation schema enforces shape", () => {
  const ok = savedSearchParamsSchema.safeParse({ type: "NEARBY", params: { lat: 1, lng: 1, radiusKm: 25, days: 30, tags: [] } });
  const bad = savedSearchParamsSchema.safeParse({ type: "NEARBY", params: { lat: 1 } });
  assert.equal(ok.success, true);
  assert.equal(bad.success, false);
});

test("saving is allowed when preview is empty", () => {
  assert.equal(canSaveFromPreview("My empty preview search", 0), true);
  assert.equal(canSaveFromPreview("", 0), false);
});


test("preview returns max 10 published items", async () => {
  const many = Array.from({ length: 16 }, (_, i) => ({ id: `e${i}`, title: `Event ${i}`, slug: `event-${i}`, startAt: new Date(), lat: null, lng: null, venue: null, eventTags: [] }));
  const result = await previewSavedSearch({
    eventDb: { event: { findMany: async () => many as any } },
    body: { type: "EVENTS_FILTER", params: { q: "abc", tags: [] } },
  });
  assert.equal(result.items.length, 10);
});


test("nearby saved search query uses to-one venue relation `is` filter", async () => {
  let capturedWhere: any = null;
  await runSavedSearchEvents({
    eventDb: {
      event: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [];
        },
      },
    },
    type: "NEARBY",
    paramsJson: { lat: 51.5, lng: -2.6, radiusKm: 25, days: 30, tags: [] },
    limit: 5,
  });

  const nearbyOr = capturedWhere.AND[0].OR;
  assert.ok(nearbyOr[1].venue.is);
});
