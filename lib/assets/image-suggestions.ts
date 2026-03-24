import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import type { AssetSuggestion, CropPreset, ImageMetadata } from "@/lib/assets/types";

function guessRecommendedCrop(metadata: ImageMetadata): CropPreset {
  const ratio = metadata.width / Math.max(1, metadata.height);
  if (ratio >= 1.7) return "hero";
  if (ratio <= 0.85) return "portrait";
  if (Math.abs(ratio - 1) < 0.15) return "square";
  return "landscape";
}

export function getImageSuggestions(input: {
  metadata: ImageMetadata;
  estimatedOptimizedByteSize?: number | null;
  photoLikeContentHint?: boolean;
}): AssetSuggestion[] {
  const suggestions: AssetSuggestion[] = [];
  const { metadata, estimatedOptimizedByteSize, photoLikeContentHint = true } = input;

  if (metadata.byteSize > ASSET_PIPELINE_CONFIG.optimizationThresholdBytes) {
    suggestions.push({
      code: "image_over_optimization_threshold",
      severity: "warning",
      message: "Image is larger than 500 KB and will be optimized for delivery.",
      meta: { byteSize: metadata.byteSize, threshold: ASSET_PIPELINE_CONFIG.optimizationThresholdBytes },
    });
  }

  const hero = ASSET_PIPELINE_CONFIG.variants.hero;
  if (metadata.width < hero.width || metadata.height < Math.floor(hero.width * 0.5)) {
    suggestions.push({
      code: "image_too_small_for_hero",
      severity: "warning",
      message: "Image may be too small for hero usage and could appear soft.",
      meta: { width: metadata.width, height: metadata.height, recommendedWidth: hero.width },
    });
  }

  suggestions.push({
    code: "recommended_crop_preset",
    severity: "info",
    message: `Recommended crop preset: ${guessRecommendedCrop(metadata)}.`,
    meta: { preset: guessRecommendedCrop(metadata) },
  });

  if (metadata.format === "png" && metadata.byteSize > ASSET_PIPELINE_CONFIG.optimizationThresholdBytes && photoLikeContentHint) {
    suggestions.push({
      code: "large_png_photo_warning",
      severity: "warning",
      message: "Large PNG detected. JPEG/WebP may deliver faster for photo-like images.",
    });
  }

  if (typeof estimatedOptimizedByteSize === "number" && estimatedOptimizedByteSize > 0 && estimatedOptimizedByteSize < metadata.byteSize) {
    suggestions.push({
      code: "estimated_optimization_savings",
      severity: "info",
      message: `Estimated optimization savings: ${Math.max(0, metadata.byteSize - estimatedOptimizedByteSize)} bytes.`,
      meta: {
        originalByteSize: metadata.byteSize,
        estimatedOptimizedByteSize,
        estimatedSavingsBytes: metadata.byteSize - estimatedOptimizedByteSize,
      },
    });
  }

  return suggestions;
}
