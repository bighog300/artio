import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleTrackPageView } from "@/lib/page-view-route";

const mockDb = db as unknown as {
  siteSettings: {
    findUnique: (args: { where: { id: string }; select: { analyticsSalt: boolean } }) => Promise<{ analyticsSalt: string | null } | null>;
  };
};

mockDb.siteSettings = {
  findUnique: async () => ({ analyticsSalt: null }),
};

test("/api/analytics/view validates payload", async () => {
  const req = new NextRequest("http://localhost/api/analytics/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entityType: "ARTWORK", entityId: "bad" }),
  });

  const res = await handleTrackPageView(req, {
    getSessionUser: async () => null,
    createEvent: async () => undefined,
    incrementDaily: async () => undefined,
  });

  assert.equal(res.status, 400);
});

test("/api/analytics/view writes event and increments daily", async () => {
  const req = new NextRequest("http://localhost/api/analytics/view", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({ entityType: "ARTWORK", entityId: "11111111-1111-4111-8111-111111111111" }),
  });

  let eventWrites = 0;
  let dailyWrites = 0;
  const res = await handleTrackPageView(req, {
    getSessionUser: async () => ({ id: "22222222-2222-4222-8222-222222222222" }),
    createEvent: async (input) => {
      eventWrites += 1;
      assert.equal(input.entityType, "ARTWORK");
      assert.equal(input.entityId, "11111111-1111-4111-8111-111111111111");
      assert.equal(input.userId, "22222222-2222-4222-8222-222222222222");
      assert.equal(input.day.toISOString().endsWith("T00:00:00.000Z"), true);
    },
    incrementDaily: async (input) => {
      dailyWrites += 1;
      assert.equal(input.entityType, "ARTWORK");
    },
  });

  assert.equal(res.status, 204);
  assert.equal(eventWrites, 1);
  assert.equal(dailyWrites, 1);
});
