import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import type { ProcessedImage } from "@/lib/assets/types";

let sharpPromise: Promise<{ default: (input: Buffer, options: { failOn: "none" }) => any } | null> | null = null;

async function getSharpModule() {
  if (!sharpPromise) {
    sharpPromise = Promise.resolve().then(() => {
      try {
        const required = (Function("return require")() as (id: string) => { default?: unknown } | ((...args: unknown[]) => unknown))("sharp");
        if (typeof required === "function") {
          return { default: required as (input: Buffer, options: { failOn: "none" }) => any };
        }
        if (required && typeof required === "object" && typeof required.default === "function") {
          return { default: required.default as (input: Buffer, options: { failOn: "none" }) => any };
        }
        return null;
      } catch {
        return null;
      }
    });
  }
  return sharpPromise;
}

function longEdge(width: number, height: number) {
  return Math.max(width, height);
}

export async function processImage(input: { bytes: Uint8Array; mimeType: string }): Promise<ProcessedImage> {
  const initial = inspectImageMetadata({ bytes: input.bytes, mimeType: input.mimeType });
  if (!initial) {
    throw new Error("unable_to_read_image_metadata");
  }

  const diagnostics: string[] = [];
  const sharpModule = await getSharpModule();
  if (!sharpModule) {
    diagnostics.push("sharp_unavailable_passthrough_used");
    return {
      bytes: input.bytes,
      metadata: initial,
      optimized: false,
      optimizationSavingsBytes: 0,
      diagnostics,
    };
  }

  const sharp = sharpModule.default;
  const instance = sharp(Buffer.from(input.bytes), { failOn: "none" }).rotate();

  if (longEdge(initial.width, initial.height) > ASSET_PIPELINE_CONFIG.maxMasterLongEdge) {
    instance.resize({
      width: initial.width >= initial.height ? ASSET_PIPELINE_CONFIG.maxMasterLongEdge : undefined,
      height: initial.height > initial.width ? ASSET_PIPELINE_CONFIG.maxMasterLongEdge : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
    diagnostics.push("resized_to_max_master_long_edge");
  }

  const shouldOptimize = initial.byteSize > ASSET_PIPELINE_CONFIG.optimizationThresholdBytes;
  const output = shouldOptimize || input.mimeType === "image/png"
    ? await instance.jpeg({ quality: ASSET_PIPELINE_CONFIG.quality.jpeg, mozjpeg: true }).toBuffer()
    : await instance.toBuffer();

  const outputMime = shouldOptimize || input.mimeType === "image/png" ? "image/jpeg" : input.mimeType;
  const outputMetadata = inspectImageMetadata({ bytes: new Uint8Array(output), mimeType: outputMime });
  if (!outputMetadata) {
    throw new Error("unable_to_read_processed_image_metadata");
  }

  const optimizationSavingsBytes = Math.max(0, initial.byteSize - output.byteLength);
  if (shouldOptimize && optimizationSavingsBytes > 0) {
    diagnostics.push("optimized_over_threshold");
  }

  return {
    bytes: new Uint8Array(output),
    metadata: outputMetadata,
    optimized: shouldOptimize && optimizationSavingsBytes > 0,
    optimizationSavingsBytes,
    diagnostics,
  };
}
