import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAssetCrop, saveImageAssetPipeline } from "../lib/assets/save-asset";

function fakePngBytes(width: number, height: number) {
  const bytes = new Uint8Array(64);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

function buildDbHarness() {
  const assets = new Map<string, any>();
  const variants: Array<any> = [];
  let assetCreateCount = 0;
  let variantDeleteManyCount = 0;

  const dbClient = {
    asset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assetCreateCount += 1;
        const id = `asset-${assetCreateCount}`;
        const row = { id, processingError: null, processingStatus: "UPLOADED", variants: [], ...data };
        assets.set(id, row);
        return row;
      },
      update: async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: { variants: boolean } }) => {
        const existing = assets.get(where.id);
        const updated = { ...existing, ...data };
        if (include?.variants) updated.variants = variants.filter((v) => v.assetId === where.id);
        assets.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = assets.get(where.id);
        if (!found) return null;
        return {
          id: found.id,
          ownerUserId: found.ownerUserId ?? null,
          originalUrl: found.originalUrl ?? null,
          mimeType: found.mimeType ?? null,
        };
      },
    },
    assetVariant: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        variants.push(data);
        return { id: `variant-${variants.length}`, ...data };
      },
      deleteMany: async ({ where }: { where: { assetId: string } }) => {
        variantDeleteManyCount += 1;
        for (let i = variants.length - 1; i >= 0; i -= 1) {
          if (variants[i].assetId === where.assetId) variants.splice(i, 1);
        }
      },
    },
  } as never;

  return { dbClient, assets, variants, counters: { get assetCreateCount() { return assetCreateCount; }, get variantDeleteManyCount() { return variantDeleteManyCount; } } };
}

test("saveImageAssetPipeline returns processing summary and persists variants without blob credentials", async () => {
  const harness = buildDbHarness();
  let uploadCalls = 0;

  const result = await saveImageAssetPipeline({
    dbClient: harness.dbClient,
    ownerUserId: "user-1",
    fileName: "upload.png",
    sourceMimeType: "image/png",
    sourceBytes: fakePngBytes(1200, 800),
    crop: { x: 0, y: 0, width: 1000, height: 700, aspectRatio: 4 / 3, preset: "landscape", zoom: 1.2, focalPointX: 0.5, focalPointY: 0.5 },
    uploadToBlob: async () => ({ url: `https://blob.example/${++uploadCalls}.jpg` }) as { url: string },
  });

  assert.equal(result.asset.processingStatus, "READY");
  assert.equal(typeof result.processing.transformApplied, "boolean");
  assert.equal(typeof result.processing.fallbackUsed, "boolean");
  assert.equal(Array.isArray(result.processing.diagnostics), true);
  assert.ok(result.variants.length >= 4);
  assert.equal(uploadCalls >= 6, true);
});

test("saveImageAssetPipeline marks asset failed when binary save fails", async () => {
  const harness = buildDbHarness();
  let uploadCalls = 0;

  await assert.rejects(() => saveImageAssetPipeline({
    dbClient: harness.dbClient,
    ownerUserId: "user-1",
    fileName: "broken.png",
    sourceMimeType: "image/png",
    sourceBytes: fakePngBytes(1200, 800),
    uploadToBlob: async () => {
      uploadCalls += 1;
      if (uploadCalls === 1) return { url: "https://blob.example/original.jpg" } as { url: string };
      throw new Error("blob_down");
    },
  }), /blob_down/);

  const failed = harness.assets.get("asset-1");
  assert.equal(failed.processingStatus, "FAILED");
  assert.match(failed.processingError ?? "", /blob_down/);
});

test("finalizeAssetCrop updates cropJson, replaces variants, and returns processing summary", async () => {
  const harness = buildDbHarness();
  harness.assets.set("asset-existing", {
    id: "asset-existing",
    ownerUserId: "user-2",
    originalUrl: "https://blob.example/original.png",
    mimeType: "image/png",
    processingStatus: "READY",
    url: "https://blob.example/old-master.jpg",
  });
  harness.variants.push({ assetId: "asset-existing", variantName: "card", url: "https://blob.example/old-card.jpg" });

  const previousFetch = globalThis.fetch;
  const uploadUrls: string[] = [];
  globalThis.fetch = (async () => new Response(fakePngBytes(1000, 1000), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;

  try {
    const crop = { x: 120, y: 100, width: 800, height: 800, aspectRatio: 1, preset: "square" as const, zoom: 1.5, focalPointX: 0.5, focalPointY: 0.5 };
    const finalized = await finalizeAssetCrop({
      dbClient: harness.dbClient,
      assetId: "asset-existing",
      crop,
      uploadToBlob: async (_key, _bytes, _opts) => {
        const url = `https://blob.example/final-${uploadUrls.length + 1}.jpg`;
        uploadUrls.push(url);
        return { url } as { url: string };
      },
    });

    assert.equal(finalized.asset.processingStatus, "READY");
    assert.deepEqual(finalized.asset.cropJson, crop);
    assert.equal(harness.counters.variantDeleteManyCount, 1);
    assert.ok(finalized.asset.variants.length >= 4);
    assert.equal(typeof finalized.processing.optimizationAttempted, "boolean");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
