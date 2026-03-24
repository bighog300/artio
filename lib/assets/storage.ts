import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "bin";
}

export async function saveAssetBinary(params: {
  ownerUserId?: string | null;
  kind: "original" | "master" | "variant";
  variantName?: string;
  bytes: Uint8Array;
  mimeType: string;
  uploadToBlob?: typeof put;
}) {
  const uploadToBlob = params.uploadToBlob ?? put;
  const hash = createHash("sha256").update(params.bytes).digest("hex").slice(0, 20);
  const ext = extensionForMimeType(params.mimeType);
  const ownerSegment = params.ownerUserId ?? "system";
  const variantSegment = params.variantName ? `-${params.variantName}` : "";
  const storageKey = `assets/${ownerSegment}/${Date.now()}-${params.kind}${variantSegment}-${hash}.${ext}`;

  const blob = await uploadToBlob(storageKey, Buffer.from(params.bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType: params.mimeType,
    cacheControlMaxAge: 31536000,
  });

  return {
    storageKey,
    url: blob.url,
  };
}
