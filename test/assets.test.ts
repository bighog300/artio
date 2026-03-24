import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGE_UPLOAD_BYTES, resolveImageUrl, validateImageFile } from "../lib/assets.ts";
import { uploadImageAsset } from "../lib/assets/server.ts";
import { saveAssetBinary } from "../lib/assets/storage.ts";

test("validateImageFile rejects unsupported mime types", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
  assert.throws(() => validateImageFile(file), /invalid_mime/);
});

test("validateImageFile rejects oversized files", () => {
  const file = new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], "large.png", { type: "image/png" });
  assert.throws(() => validateImageFile(file), /file_too_large/);
});

test("unit: uploadImageAsset returns assetId/url and stores metadata with stubbed storage", async () => {
  const pngBytes = new Uint8Array(64);
  pngBytes[0] = 0x89;
  pngBytes[1] = 0x50;
  pngBytes[2] = 0x4e;
  pngBytes[3] = 0x47;
  pngBytes[16] = 0x00;
  pngBytes[17] = 0x00;
  pngBytes[18] = 0x04;
  pngBytes[19] = 0x00;
  pngBytes[20] = 0x00;
  pngBytes[21] = 0x00;
  pngBytes[22] = 0x03;
  pngBytes[23] = 0x00;
  const file = new File([pngBytes], "photo.png", { type: "image/png" });

  const createdRows: Array<Record<string, unknown>> = [];
  const updatedRows: Array<Record<string, unknown>> = [];
  const createdVariants: Array<Record<string, unknown>> = [];
  const result = await uploadImageAsset({
    file,
    ownerUserId: "user-123",
    uploadToBlob: async () => ({ url: "https://blob.example/photo.jpg" }) as { url: string },
    dbClient: {
      asset: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdRows.push(data);
          return { id: "asset-1", url: data.url };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updatedRows.push(data);
          return { id: "asset-1", url: String(data.url ?? "https://blob.example/photo.jpg") };
        },
      },
      assetVariant: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdVariants.push(data);
          return { id: `variant-${createdVariants.length}` };
        },
      },
    } as never,
  });

  assert.deepEqual(result, { assetId: "asset-1", url: "https://blob.example/photo.jpg" });
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].ownerUserId, "user-123");
  assert.equal(createdRows[0].mime, "image/png");
  assert.equal(updatedRows.length, 1);
  assert.equal(createdVariants.length, 5);
});

test("integration: saveAssetBinary uploads to blob when BLOB_READ_WRITE_TOKEN is set", async (t) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    t.skip("requires BLOB_READ_WRITE_TOKEN");
    return;
  }

  const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38]);
  const saved = await saveAssetBinary({
    ownerUserId: "integration-test",
    kind: "original",
    bytes,
    mimeType: "image/gif",
  });

  assert.match(saved.storageKey, /^assets\/integration-test\/\d+-original-[a-f0-9]{20}\.bin$/);
  assert.ok(saved.url.startsWith("https://"));
});

test("resolveImageUrl prefers asset URL over legacy URL", () => {
  assert.equal(resolveImageUrl("https://blob.example/a.jpg", "https://legacy.example/a.jpg"), "https://blob.example/a.jpg");
  assert.equal(resolveImageUrl(null, "https://legacy.example/a.jpg"), "https://legacy.example/a.jpg");
});
