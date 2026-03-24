import type { AssetVariantName } from "@/lib/assets/types";

type AssetWithVariants = {
  url?: string | null;
  variants?: Array<{ variantName: string; url: string | null }> | null;
};

export function getAssetVariantUrl(asset: AssetWithVariants | null | undefined, variantName: AssetVariantName): string | null {
  if (!asset) return null;
  const exact = asset.variants?.find((variant) => variant.variantName === variantName)?.url;
  if (exact) return exact;
  const firstAvailable = asset.variants?.find((variant) => Boolean(variant.url))?.url;
  return firstAvailable ?? asset.url ?? null;
}
