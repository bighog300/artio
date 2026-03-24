import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import type { AssetCrop, AssetVariantName, GeneratedVariant, ProcessedImage } from "@/lib/assets/types";

async function getSharp() {
  try {
    const required = (Function("return require")() as (id: string) => { default?: unknown } | ((...args: unknown[]) => unknown))("sharp");
    if (typeof required === "function") return required as (input: Buffer, options: { failOn: "none" }) => any;
    if (required && typeof required === "object" && typeof required.default === "function") {
      return required.default as (input: Buffer, options: { failOn: "none" }) => any;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateImageVariants(input: { master: ProcessedImage; crop?: AssetCrop | null }): Promise<GeneratedVariant[]> {
  const sharp = await getSharp();
  const variantNames = Object.keys(ASSET_PIPELINE_CONFIG.variants) as AssetVariantName[];

  if (!sharp) {
    return variantNames.map((name) => ({
      name,
      bytes: input.master.bytes,
      metadata: input.master.metadata,
    }));
  }

  const variants: GeneratedVariant[] = [];
  for (const name of variantNames) {
    const preset = ASSET_PIPELINE_CONFIG.variants[name];
    const instance = sharp(Buffer.from(input.master.bytes), { failOn: "none" }).rotate();

    if (input.crop) {
      instance.extract({
        left: Math.max(0, Math.floor(input.crop.x)),
        top: Math.max(0, Math.floor(input.crop.y)),
        width: Math.max(1, Math.floor(input.crop.width)),
        height: Math.max(1, Math.floor(input.crop.height)),
      });
    }

    instance.resize({
      width: preset.width,
      height: preset.height,
      fit: preset.fit,
      withoutEnlargement: true,
    });

    const out = await instance.jpeg({ quality: ASSET_PIPELINE_CONFIG.quality.jpeg, mozjpeg: true }).toBuffer();
    const metadata = inspectImageMetadata({ bytes: new Uint8Array(out), mimeType: "image/jpeg" });
    if (!metadata) continue;

    variants.push({ name, bytes: new Uint8Array(out), metadata });
  }

  return variants;
}
