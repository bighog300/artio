import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_UPLOAD_BYTES = ASSET_PIPELINE_CONFIG.maxUploadBytes;

export function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error("invalid_mime");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("file_too_large");
  }
}

export function resolveImageUrl(assetUrl: string | null | undefined, legacyUrl: string | null | undefined) {
  return assetUrl || legacyUrl || null;
}

export { resolveAssetDisplay };
