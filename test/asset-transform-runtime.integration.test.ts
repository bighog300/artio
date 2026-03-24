import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getImageTransformRuntimeStatus } from "../lib/assets/transform-runtime";
import { processImage } from "../lib/assets/process-image";
import { generateImageVariants } from "../lib/assets/generate-variants";

test("real transform runtime shrinks large uploads and applies crop dimensions", async (t) => {
  const runtime = await getImageTransformRuntimeStatus();
  if (!runtime.available) {
    t.skip("sharp runtime unavailable; skipping real transform integration test");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = (Function("return require")() as (id: string) => any)("sharp");

  const width = 1400;
  const height = 1000;
  const raw = randomBytes(width * height * 3);
  const pngBuffer = await sharp(Buffer.from(raw), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();

  const sourceBytes = new Uint8Array(pngBuffer);
  assert.ok(sourceBytes.byteLength > 500 * 1024, "fixture should exceed optimization threshold");

  const processed = await processImage({ bytes: sourceBytes, mimeType: "image/png" });
  assert.equal(processed.runtime.available, true);
  assert.equal(processed.fallbackUsed, false);
  assert.equal(processed.transformApplied, true);
  assert.ok(processed.metadata.byteSize < sourceBytes.byteLength, "optimized master should be smaller than input");

  const variants = await generateImageVariants({
    master: processed,
    crop: {
      x: 250,
      y: 80,
      width: 900,
      height: 900,
      aspectRatio: 1,
      preset: "square",
      zoom: 1.2,
      focalPointX: 0.5,
      focalPointY: 0.5,
    },
  });
  const square = variants.find((variant) => variant.name === "square");
  assert.ok(square, "square variant should be generated");
  assert.equal(square?.metadata.width, 800);
  assert.equal(square?.metadata.height, 800);
});
