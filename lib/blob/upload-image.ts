import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

function extensionForContentType(contentType: string): string {
  if (contentType.includes("image/jpeg")) return "jpg";
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/gif")) return "gif";
  return "bin";
}

export async function uploadEventImageToBlob(params: {
  venueId: string;
  candidateId: string;
  sourceUrl: string;
  contentType: string;
  bytes: Uint8Array;
  uploadToBlob?: typeof put;
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN.trim().length === 0) {
    throw new Error("missing_blob_read_write_token");
  }

  const uploadToBlob = params.uploadToBlob ?? put;
  const hash = createHash("sha256").update(params.bytes).update("|").update(params.sourceUrl).digest("hex");
  const extension = extensionForContentType(params.contentType);
  const path = `events/ingest/${params.venueId}/${params.candidateId}/${hash}.${extension}`;

  const blob = await uploadToBlob(path, Buffer.from(params.bytes), {
    access: "public",
    contentType: params.contentType,
    cacheControlMaxAge: 31536000,
    addRandomSuffix: false,
  });

  return { url: blob.url, path };
}
