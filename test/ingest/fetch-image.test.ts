import test from "node:test";
import assert from "node:assert/strict";
import { fetchImageWithGuards } from "../../lib/ingest/fetch-image";
import { IngestError } from "../../lib/ingest/errors";

const assertSafeUrlImpl = async (url: string) => new URL(url);

test("fetchImageWithGuards rejects non-image content type", async () => {
  await assert.rejects(
    () => fetchImageWithGuards("https://example.com/a", {
      fetchImpl: async () => new Response("not image", { headers: { "content-type": "text/html" }, status: 200 }),
      assertSafeUrlImpl,
    }),
    (error: unknown) => error instanceof IngestError && error.code === "UNSUPPORTED_CONTENT_TYPE",
  );
});

test("fetchImageWithGuards rejects oversized responses", async () => {
  const bytes = new Uint8Array(10);
  await assert.rejects(
    () => fetchImageWithGuards("https://example.com/a", {
      maxBytes: 5,
      fetchImpl: async () => new Response(bytes, { headers: { "content-type": "image/png" }, status: 200 }),
      assertSafeUrlImpl,
    }),
    (error: unknown) => error instanceof IngestError && error.code === "FETCH_TOO_LARGE",
  );
});

test("fetchImageWithGuards accepts jpeg/png", async () => {
  const jpeg = await fetchImageWithGuards("https://example.com/a.jpg", {
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" }, status: 200 }),
    assertSafeUrlImpl,
  });
  assert.equal(jpeg.contentType, "image/jpeg");
  assert.equal(jpeg.sizeBytes, 3);

  const png = await fetchImageWithGuards("https://example.com/a.png", {
    fetchImpl: async () => new Response(new Uint8Array([4, 5]), { headers: { "content-type": "image/png" }, status: 200 }),
    assertSafeUrlImpl,
  });
  assert.equal(png.contentType, "image/png");
  assert.equal(png.sizeBytes, 2);
});
