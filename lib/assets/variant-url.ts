import type { AssetVariantName } from "@/lib/assets/types";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";

type AssetWithVariants = {
  url?: string | null;
  variants?: Array<{ variantName: string; url: string | null }> | null;
};

export function getAssetVariantUrl(asset: AssetWithVariants | null | undefined, variantName: AssetVariantName): string | null {
  return resolveAssetDisplay({
    asset: asset
      ? {
        url: asset.url,
        variants: asset.variants ?? [],
      }
      : null,
    requestedVariant: variantName,
  }).url;
}
