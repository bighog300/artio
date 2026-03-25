import test from "node:test";
import assert from "node:assert/strict";
import { getImageSuggestions } from "../lib/assets/image-suggestions";
import { processImage } from "../lib/assets/process-image";
import { generateImageVariants } from "../lib/assets/generate-variants";
import { resolveAssetDisplay } from "../lib/assets/resolve-asset-display";
import { getImageTransformRuntimeStatus } from "../lib/assets/transform-runtime";

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

test("runtime status is explicit and stable", async () => {
  const status = await getImageTransformRuntimeStatus();
  assert.equal(typeof status.available, "boolean");
  assert.ok(["sharp", "none"].includes(status.provider));
  assert.ok(["transform", "passthrough"].includes(status.mode));
  assert.ok(["ok", "sharp_not_installed", "sharp_load_failed"].includes(status.reason));
});

test("processImage reports transform and fallback semantics", async () => {
  const status = await getImageTransformRuntimeStatus();
  const input = fakePngBytes(1400, 1100);
  const processed = await processImage({ bytes: input, mimeType: "image/png" });

  assert.equal(processed.runtime.mode, status.mode);
  assert.equal(processed.runtime.provider, status.provider);
  assert.equal(typeof processed.optimizationAttempted, "boolean");

  if (!status.available) {
    assert.equal(processed.fallbackUsed, true);
    assert.equal(processed.transformApplied, false);
    assert.equal(processed.processingPartial, true);
    assert.equal(processed.optimizationStatus, "skipped_runtime_unavailable");
  }
});

test("generateImageVariants marks transformed vs copied", async () => {
  const input = fakePngBytes(1200, 800);
  const processed = await processImage({ bytes: input, mimeType: "image/png" });
  const variantResult = await generateImageVariants({ master: processed, crop: { x: 0, y: 0, width: 1000, height: 700, aspectRatio: 4 / 3, preset: "landscape", zoom: 1.4, focalPointX: 0.4, focalPointY: 0.6 } });
  const variants = variantResult.variants;

  assert.ok(variants.length >= 4);
  const allTransformed = variants.every((variant) => variant.transformed);
  if (processed.fallbackUsed) {
    assert.equal(allTransformed, false);
    assert.equal(variantResult.fallbackUsed, true);
  }
});

test("resolveAssetDisplay handles variant fallback, failure state, and legacy URL", () => {
  const resolved = resolveAssetDisplay({
    asset: {
      url: "https://blob/master.jpg",
      originalUrl: "https://blob/original.jpg",
      processingStatus: "FAILED",
      processingError: "transform unavailable",
      variants: [{ variantName: "thumb", url: "https://blob/thumb.jpg" }],
    },
    requestedVariant: "hero",
    legacyUrl: "https://legacy/item.jpg",
  });

  assert.equal(resolved.url, "https://blob/thumb.jpg");
  assert.equal(resolved.source, "variant");
  assert.equal(resolved.variantNameUsed, "thumb");
  assert.equal(resolved.hasFailure, true);
  assert.match(resolved.failureMessage ?? "", /unavailable/);
});

test("resolveAssetDisplay falls back to legacy URL for unmigrated records", () => {
  const resolved = resolveAssetDisplay({ requestedVariant: "card", legacyUrl: "https://legacy/item.jpg" });
  assert.equal(resolved.url, "https://legacy/item.jpg");
  assert.equal(resolved.source, "legacy");
});

test(">500 KB image gets optimization suggestion and hero warning for small dimensions", () => {
  const suggestions = getImageSuggestions({
    metadata: {
      mimeType: "image/png",
      byteSize: 800 * 1024,
      width: 900,
      height: 500,
      format: "png",
      hasAlpha: true,
    },
    estimatedOptimizedByteSize: 460 * 1024,
  });

  assert.ok(suggestions.some((suggestion) => suggestion.code === "image_over_optimization_threshold"));
  assert.ok(suggestions.some((suggestion) => suggestion.code === "image_too_small_for_hero"));
  assert.ok(suggestions.some((suggestion) => suggestion.code === "estimated_optimization_savings"));
});
