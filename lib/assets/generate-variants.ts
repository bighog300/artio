import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import { getSharpModule } from "@/lib/assets/transform-runtime";
import type { AssetCrop, AssetVariantName, GeneratedVariant, ProcessedImage } from "@/lib/assets/types";

export async function generateImageVariants(input: { master: ProcessedImage; crop?: AssetCrop | null }): Promise<GeneratedVariant[]> {
  const sharp = await getSharpModule();
  const variantNames = Object.keys(ASSET_PIPELINE_CONFIG.variants) as AssetVariantName[];

  if (!sharp) {
    return variantNames.map((name) => ({
      name,
      bytes: input.master.bytes,
      metadata: input.master.metadata,
      transformed: false,
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

    variants.push({ name, bytes: new Uint8Array(out), metadata, transformed: true });
  }

  return variants;
}
