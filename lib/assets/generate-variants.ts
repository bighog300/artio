import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { inspectImageMetadata } from "@/lib/assets/inspect-image";
import { getSharpModule } from "@/lib/assets/transform-runtime";
import type { AssetCrop, AssetVariantName, GeneratedVariantsResult, ProcessedImage } from "@/lib/assets/types";

export async function generateImageVariants(input: { master: ProcessedImage; crop?: AssetCrop | null }): Promise<GeneratedVariantsResult> {
  const sharp = await getSharpModule();
  const variantNames = Object.keys(ASSET_PIPELINE_CONFIG.variants) as AssetVariantName[];
  const diagnostics: string[] = [];

  if (!sharp) {
    diagnostics.push("variant_generation_runtime_unavailable_copy_used");
    return {
      variants: variantNames.map((name) => ({
        name,
        bytes: input.master.bytes,
        metadata: input.master.metadata,
        transformed: false,
      })),
      diagnostics,
      fallbackUsed: true,
      degraded: true,
      transformedVariants: 0,
      totalVariants: variantNames.length,
    };
  }

  const variants: GeneratedVariantsResult["variants"] = [];
  for (const name of variantNames) {
    try {
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
      if (!metadata) {
        diagnostics.push(`variant_generation_metadata_missing_${name}`);
        variants.push({ name, bytes: input.master.bytes, metadata: input.master.metadata, transformed: false });
        continue;
      }

      variants.push({ name, bytes: new Uint8Array(out), metadata, transformed: true });
    } catch {
      diagnostics.push(`variant_generation_failed_${name}_copy_used`);
      variants.push({ name, bytes: input.master.bytes, metadata: input.master.metadata, transformed: false });
    }
  }

  const transformedVariants = variants.filter((variant) => variant.transformed).length;
  return {
    variants,
    diagnostics,
    fallbackUsed: transformedVariants !== variantNames.length,
    degraded: diagnostics.length > 0 || transformedVariants !== variantNames.length,
    transformedVariants,
    totalVariants: variantNames.length,
  };
}
