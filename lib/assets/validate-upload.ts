import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import type { UploadValidationResult } from "@/lib/assets/types";

export async function validateImageUpload(file: File): Promise<UploadValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ASSET_PIPELINE_CONFIG.acceptedMimeTypes.includes(file.type)) {
    errors.push("unsupported_mime_type");
  }
  if (file.size > ASSET_PIPELINE_CONFIG.maxUploadBytes) {
    errors.push("file_too_large");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = inspectImageMetadata({ bytes, mimeType: file.type });
  if (!metadata) {
    errors.push("unable_to_read_image_metadata");
  }

  if (metadata && metadata.byteSize > ASSET_PIPELINE_CONFIG.optimizationThresholdBytes) {
    warnings.push("image_over_optimization_threshold");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata,
  };
}
