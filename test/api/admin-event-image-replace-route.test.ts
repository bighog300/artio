import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminEventImageReplace } from "../../lib/admin-event-image-replace-route";

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/admin/events/${eventId}/image`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("replaces event image and returns 200 on happy path", async () => {
  const calls = {
    updateMany: 0,
    eventImageCreate: [] as Array<Record<string, unknown>>,
    eventUpdate: [] as Array<Record<string, unknown>>,
    logged: 0,
  };

  const tx = {
    asset: {
      create: async () => ({ id: "asset-2" }),
    },
    eventImage: {
      updateMany: async () => {
        calls.updateMany += 1;
        return { count: 1 };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.eventImageCreate.push(args.data);
        return { id: "image-2" };
      },
    },
    event: {
      update: async (args: { data: Record<string, unknown> }) => {
        calls.eventUpdate.push(args.data);
        return { id: eventId };
      },
    },
  };

  const response = await handleAdminEventImageReplace(
    makeRequest({ sourceUrl: "https://example.com/image.jpg" }),
    { id: eventId },
    "admin@example.com",
    {
      appDb: {
        event: {
          findUnique: async () => ({ id: eventId, title: "Test Event", venueId: "venue-1" }),
        },
        eventImage: tx.eventImage,
        asset: tx.asset,
        $transaction: async (fn: (input: typeof tx) => Promise<{ id: string }>) => fn(tx),
      } as never,
      assertUrlFn: async () => new URL("https://example.com/image.jpg"),
      fetchImageFn: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
        contentType: "image/jpeg",
      }),
      uploadImageFn: async () => ({ url: "https://blob.example/new.jpg", pathname: "p" }),
      logAction: async () => {
        calls.logged += 1;
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { imageId: "image-2", url: "https://blob.example/new.jpg" });
  assert.equal(calls.updateMany, 1);
  assert.equal(calls.eventImageCreate[0]?.isPrimary, true);
  assert.equal(calls.eventUpdate[0]?.featuredAssetId, "asset-2");
  assert.equal(calls.logged, 1);
});

test("returns 422 when assertUrlFn rejects source URL", async () => {
  const response = await handleAdminEventImageReplace(
    makeRequest({ sourceUrl: "http://169.254.169.254/latest" }),
    { id: eventId },
    "admin@example.com",
    {
      appDb: {
        event: { findUnique: async () => ({ id: eventId, title: "Event", venueId: "venue-1" }) },
        eventImage: {} as never,
        asset: {} as never,
      } as never,
      assertUrlFn: async () => {
        throw new Error("blocked");
      },
    } as never,
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error?.code, "invalid_source_url");
});

test("returns 422 when fetchImageFn fails", async () => {
  const response = await handleAdminEventImageReplace(
    makeRequest({ sourceUrl: "https://example.com/image.jpg" }),
    { id: eventId },
    "admin@example.com",
    {
      appDb: {
        event: { findUnique: async () => ({ id: eventId, title: "Event", venueId: "venue-1" }) },
        eventImage: {} as never,
        asset: {} as never,
      } as never,
      assertUrlFn: async () => new URL("https://example.com/image.jpg"),
      fetchImageFn: async () => {
        throw new Error("fetch failed");
      },
    } as never,
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error?.code, "fetch_failed");
});

test("returns 500 when uploadImageFn fails", async () => {
  const response = await handleAdminEventImageReplace(
    makeRequest({ sourceUrl: "https://example.com/image.jpg" }),
    { id: eventId },
    "admin@example.com",
    {
      appDb: {
        event: { findUnique: async () => ({ id: eventId, title: "Event", venueId: "venue-1" }) },
        eventImage: {} as never,
        asset: {} as never,
      } as never,
      assertUrlFn: async () => new URL("https://example.com/image.jpg"),
      fetchImageFn: async () => ({
        bytes: new Uint8Array([1]),
        sizeBytes: 1,
        contentType: "image/jpeg",
      }),
      uploadImageFn: async () => {
        throw new Error("upload failed");
      },
    } as never,
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error?.code, "upload_failed");
});

test("returns 404 when event is not found", async () => {
  const response = await handleAdminEventImageReplace(
    makeRequest({ sourceUrl: "https://example.com/image.jpg" }),
    { id: eventId },
    "admin@example.com",
    {
      appDb: {
        event: { findUnique: async () => null },
        eventImage: {} as never,
        asset: {} as never,
      } as never,
      assertUrlFn: async () => new URL("https://example.com/image.jpg"),
    } as never,
  );

  assert.equal(response.status, 404);
});
