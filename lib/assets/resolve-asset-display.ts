import type { AssetVariantName } from "@/lib/assets/types";

type VariantLike = { variantName: string; url: string | null };
type AssetDisplayLike = {
  url?: string | null;
  originalUrl?: string | null;
  processingStatus?: string | null;
  processingError?: string | null;
  variants?: VariantLike[] | null;
};

export type ResolvedAssetDisplay = {
  url: string | null;
  source: "variant" | "asset" | "original" | "legacy" | "placeholder";
  variantNameUsed: AssetVariantName | null;
  isProcessing: boolean;
  hasFailure: boolean;
  failureMessage: string | null;
  usedFallback: boolean;
};

const SAFE_FALLBACK_VARIANTS: AssetVariantName[] = ["card", "thumb", "square", "hero", "social"];

export function resolveAssetDisplay(input: {
  asset?: AssetDisplayLike | null;
  requestedVariant?: AssetVariantName | null;
  legacyUrl?: string | null;
  placeholderUrl?: string | null;
  allowOriginalUrl?: boolean;
}): ResolvedAssetDisplay {
  const {
    asset,
    requestedVariant = null,
    legacyUrl = null,
    placeholderUrl = null,
    allowOriginalUrl = true,
  } = input;

  const status = asset?.processingStatus ?? null;
  const isProcessing = status === "PROCESSING" || status === "UPLOADED";
  const hasFailure = status === "FAILED";
  const failureMessage = hasFailure ? asset?.processingError ?? "Asset processing failed" : null;

  const variants = asset?.variants ?? [];
  if (requestedVariant) {
    const exact = variants.find((variant) => variant.variantName === requestedVariant)?.url ?? null;
    if (exact) {
      return { url: exact, source: "variant", variantNameUsed: requestedVariant, isProcessing, hasFailure, failureMessage, usedFallback: false };
    }
  }

  const fallback = SAFE_FALLBACK_VARIANTS
    .map((name) => ({ name, url: variants.find((variant) => variant.variantName === name)?.url ?? null }))
    .find((item) => Boolean(item.url));
  if (fallback?.url) {
    return {
      url: fallback.url,
      source: "variant",
      variantNameUsed: fallback.name,
      isProcessing,
      hasFailure,
      failureMessage,
      usedFallback: fallback.name !== requestedVariant,
    };
  }

  if (asset?.url) {
    return { url: asset.url, source: "asset", variantNameUsed: null, isProcessing, hasFailure, failureMessage, usedFallback: true };
  }

  if (allowOriginalUrl && asset?.originalUrl) {
    return { url: asset.originalUrl, source: "original", variantNameUsed: null, isProcessing, hasFailure, failureMessage, usedFallback: true };
  }

  if (legacyUrl) {
    return { url: legacyUrl, source: "legacy", variantNameUsed: null, isProcessing, hasFailure, failureMessage, usedFallback: true };
  }

  return { url: placeholderUrl, source: "placeholder", variantNameUsed: null, isProcessing, hasFailure, failureMessage, usedFallback: true };
}
