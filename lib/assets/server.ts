import "server-only";

import { put } from "@vercel/blob";
import { saveImageAssetPipeline } from "@/lib/assets/save-asset";
import { validateImageUpload } from "@/lib/assets/validate-upload";

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
