import type { AssetVariantName } from "@/lib/assets/types";
import { resolveAssetDisplay, type ResolvedAssetDisplay } from "@/lib/assets/resolve-asset-display";

export type ApiImageField = {
  url: string | null;
  source: "variant" | "asset" | "original" | "legacy" | "placeholder";
  variant?: AssetVariantName;
  isProcessing: boolean;
  hasFailure: boolean;
};

export function toApiImageField(input: ResolvedAssetDisplay): ApiImageField {
  return {
    url: input.url,
    source: input.source,
    variant: input.variantNameUsed ?? undefined,
    isProcessing: input.isProcessing,
    hasFailure: input.hasFailure,
  };
}

export function resolveApiImageField(input: Parameters<typeof resolveAssetDisplay>[0]): ApiImageField {
  return toApiImageField(resolveAssetDisplay(input));
}
