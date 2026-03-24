import type { ImageMetadata } from "@/lib/assets/types";

function parsePngDimensions(buffer: Uint8Array) {
  if (buffer.length < 24) return null;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isPng) return null;
  const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
  const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
  return { width, height, hasAlpha: true, format: "png" as const };
}

function parseJpegDimensions(buffer: Uint8Array) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
    if (segmentLength < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && offset + 8 < buffer.length) {
      const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
      const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
      return { width, height, hasAlpha: false, format: "jpeg" as const };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpDimensions(buffer: Uint8Array) {
  if (buffer.length < 30) return null;
  const riff = String.fromCharCode(...buffer.slice(0, 4));
  const webp = String.fromCharCode(...buffer.slice(8, 12));
  if (riff !== "RIFF" || webp !== "WEBP") return null;

  const chunkType = String.fromCharCode(...buffer.slice(12, 16));
  if (chunkType === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
    const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
    return { width, height, hasAlpha: (buffer[20] & 0x10) !== 0, format: "webp" as const };
  }

  return null;
}

export function inspectImageMetadata(input: { bytes: Uint8Array; mimeType: string }): ImageMetadata | null {
  const { bytes, mimeType } = input;
  const parsed = parsePngDimensions(bytes) ?? parseJpegDimensions(bytes) ?? parseWebpDimensions(bytes);
  if (!parsed) return null;
  return {
    mimeType,
    byteSize: bytes.byteLength,
    width: parsed.width,
    height: parsed.height,
    format: parsed.format,
    hasAlpha: parsed.hasAlpha,
  };
}
