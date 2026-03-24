import { put } from "@vercel/blob";
import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { saveImageAssetPipeline } from "@/lib/assets/save-asset";
import { getImageTransformRuntimeStatus, isImageTransformAvailable } from "@/lib/assets/transform-runtime";
import { validateImageUpload } from "@/lib/assets/validate-upload";

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

export async function uploadImageAsset(params: {
  file: File;
  ownerUserId: string;
  alt?: string | null;
  uploadToBlob?: typeof put;
  dbClient: Parameters<typeof saveImageAssetPipeline>[0]["dbClient"];
}) {
  const { file, ownerUserId, alt, dbClient } = params;
  const validation = await validateImageUpload(file);
  if (!validation.isValid) {
    if (validation.errors.includes("unsupported_mime_type")) throw new Error("invalid_mime");
    if (validation.errors.includes("file_too_large")) throw new Error("file_too_large");
    throw new Error(validation.errors[0] ?? "invalid_upload");
  }

  const saved = await saveImageAssetPipeline({
    dbClient,
    ownerUserId,
    fileName: file.name,
    sourceMimeType: file.type,
    sourceBytes: new Uint8Array(await file.arrayBuffer()),
    altText: alt ?? null,
  });

  return { assetId: saved.asset.id, url: saved.asset.url };
}

export function resolveImageUrl(assetUrl: string | null | undefined, legacyUrl: string | null | undefined) {
  return assetUrl || legacyUrl || null;
}

export { getImageTransformRuntimeStatus, isImageTransformAvailable, resolveAssetDisplay };
