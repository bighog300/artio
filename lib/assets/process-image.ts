
import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { getImageTransformRuntimeStatus, getSharpModule } from "@/lib/assets/transform-runtime";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import type { ProcessedImage } from "@/lib/assets/types";

function longEdge(width: number, height: number) {
  return Math.max(width, height);
}

export async function processImage(input: { bytes: Uint8Array; mimeType: string }): Promise<ProcessedImage> {
  const initial = inspectImageMetadata({ bytes: input.bytes, mimeType: input.mimeType });
  if (!initial) {
    throw new Error("unable_to_read_image_metadata");
  }

  const diagnostics: string[] = [];
  const runtimeStatus = await getImageTransformRuntimeStatus();
  const sharp = await getSharpModule();
  if (!sharp) {
    diagnostics.push("transform_runtime_unavailable_passthrough_used");
    return {
      bytes: input.bytes,
      metadata: initial,
      optimized: false,
      optimizationAttempted: false,
      optimizationStatus: "skipped_runtime_unavailable",
      optimizationSavingsBytes: 0,
      transformApplied: false,
      fallbackUsed: true,
      processingPartial: true,
      runtime: runtimeStatus,
      diagnostics,
    };
  }

  try {
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
    const optimizationAttempted = shouldOptimize || input.mimeType === "image/png";
    if (!optimizationAttempted) diagnostics.push("optimization_skipped_below_threshold");
    if (optimizationAttempted) diagnostics.push("optimization_attempted");

    const output = optimizationAttempted
      ? await instance.jpeg({ quality: ASSET_PIPELINE_CONFIG.quality.jpeg, mozjpeg: true }).toBuffer()
      : await instance.toBuffer();

    const outputMime = optimizationAttempted ? "image/jpeg" : input.mimeType;
    const outputMetadata = inspectImageMetadata({ bytes: new Uint8Array(output), mimeType: outputMime });
    if (!outputMetadata) {
      throw new Error("unable_to_read_processed_image_metadata");
    }

    const optimizationSavingsBytes = Math.max(0, initial.byteSize - output.byteLength);
    if (optimizationAttempted && optimizationSavingsBytes === 0) {
      diagnostics.push("optimization_attempted_no_savings");
    }
    if (optimizationAttempted && optimizationSavingsBytes > 0) {
      diagnostics.push("optimized_output_smaller");
    }

    return {
      bytes: new Uint8Array(output),
      metadata: outputMetadata,
      optimized: optimizationAttempted && optimizationSavingsBytes > 0,
      optimizationAttempted,
      optimizationStatus: optimizationAttempted
        ? (optimizationSavingsBytes > 0 ? "optimized" : "attempted_no_savings")
        : "skipped_below_threshold",
      optimizationSavingsBytes,
      transformApplied: true,
      fallbackUsed: false,
      processingPartial: false,
      runtime: runtimeStatus,
      diagnostics,
    };
  } catch {
    diagnostics.push("transform_failed_passthrough_used");
    return {
      bytes: input.bytes,
      metadata: initial,
      optimized: false,
      optimizationAttempted: false,
      optimizationStatus: "skipped_transform_failed",
      optimizationSavingsBytes: 0,
      transformApplied: false,
      fallbackUsed: true,
      processingPartial: true,
      runtime: runtimeStatus,
      diagnostics,
    };
  }
}
