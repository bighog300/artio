import type { AssetPipelineConfig } from "@/lib/assets/types";

export const ASSET_PIPELINE_CONFIG: AssetPipelineConfig = {
  maxUploadBytes: 10 * 1024 * 1024,
  optimizationThresholdBytes: 500 * 1024,
  maxMasterLongEdge: 2400,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  outputFormats: ["jpeg", "webp"],
  quality: {
    jpeg: 82,
    webp: 80,
  },
  variants: {
    thumb: { width: 320, fit: "inside" },
    card: { width: 800, fit: "inside" },
    hero: { width: 1600, fit: "inside" },
    square: { width: 800, height: 800, fit: "cover" },
    social: { width: 1200, height: 630, fit: "cover" },
  },
};
