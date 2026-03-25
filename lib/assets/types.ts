export type AssetVariantName = "thumb" | "card" | "hero" | "square" | "social";

export type AssetSuggestionSeverity = "info" | "warning" | "error";

export type AssetSuggestionCode =
  | "image_over_optimization_threshold"
  | "image_too_small_for_hero"
  | "recommended_crop_preset"
  | "large_png_photo_warning"
  | "estimated_optimization_savings";

export type AssetSuggestion = {
  code: AssetSuggestionCode;
  severity: AssetSuggestionSeverity;
  message: string;
  meta?: Record<string, string | number | boolean | null>;
};

export type ImageMetadata = {
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp" | "unknown";
  hasAlpha: boolean;
};

export type UploadValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: ImageMetadata | null;
};

export type ProcessedImage = {
  bytes: Uint8Array;
  metadata: ImageMetadata;
  optimized: boolean;
  optimizationAttempted: boolean;
  optimizationStatus:
    | "optimized"
    | "attempted_no_savings"
    | "skipped_below_threshold"
    | "skipped_runtime_unavailable"
    | "skipped_transform_failed";
  optimizationSavingsBytes: number;
  transformApplied: boolean;
  fallbackUsed: boolean;
  processingPartial: boolean;
  runtime: {
    provider: "sharp" | "none";
    mode: "transform" | "passthrough";
    reason: "ok" | "sharp_not_installed" | "sharp_load_failed";
  };
  diagnostics: string[];
};

export type GeneratedVariant = {
  name: AssetVariantName;
  bytes: Uint8Array;
  metadata: ImageMetadata;
  transformed: boolean;
};

export type GeneratedVariantsResult = {
  variants: GeneratedVariant[];
  diagnostics: string[];
  fallbackUsed: boolean;
  degraded: boolean;
  transformedVariants: number;
  totalVariants: number;
};

export type AssetPipelineConfig = {
  maxUploadBytes: number;
  optimizationThresholdBytes: number;
  maxMasterLongEdge: number;
  acceptedMimeTypes: readonly string[];
  outputFormats: readonly ("jpeg" | "webp")[];
  quality: {
    jpeg: number;
    webp: number;
  };
  variants: Record<AssetVariantName, { width: number; height?: number; fit: "inside" | "cover" }>;
};

export type CropPreset = "square" | "landscape" | "portrait" | "hero";

export type AssetCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: number;
  zoom?: number;
  focalPointX?: number;
  focalPointY?: number;
  preset?: CropPreset;
};
