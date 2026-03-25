import type { AssetVariantName } from "@/lib/assets/types";
import { resolveAssetDisplay, type ResolvedAssetDisplay } from "@/lib/assets/resolve-asset-display";

export type ApiImageField = {
  url: string | null;
  source: "variant" | "asset" | "original" | "legacy" | "placeholder";
  variant?: AssetVariantName;
  isProcessing: boolean;
  hasFailure: boolean;
};

/**
 * Centralized image contract for API responses.
 * New endpoints should expose this field and treat flat URL fields as transitional compatibility only.
 */
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

/**
 * Transitional compatibility shape for legacy consumers that still read flat URL image fields.
 * @deprecated Prefer `ApiImageField` and remove these aliases after full client migration.
 */
export type LegacyApiImageFields = {
  imageUrl?: string | null;
  thumbUrl?: string | null;
  primaryImageUrl?: string | null;
  coverUrl?: string | null;
  avatarImageUrl?: string | null;
};
