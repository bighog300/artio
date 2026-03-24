import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { normalizeUrlOrNull, safeParseImagesJson } from "@/lib/images";

export type PublicImage = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  isPrimary: boolean;
  isProcessing: boolean;
  hasFailure: boolean;
};

type EntityImageLike = {
  url?: string | null;
  alt?: string | null;
  sortOrder?: number | null;
  isPrimary?: boolean | null;
  width?: number | null;
  height?: number | null;
  asset?: {
    url?: string | null;
    originalUrl?: string | null;
    processingStatus?: string | null;
    processingError?: string | null;
    variants?: Array<{ variantName: string; url: string | null }> | null;
  } | null;
};

type EntityWithImages = {
  name?: string | null;
  title?: string | null;
  featuredImageUrl?: string | null;
  images?: unknown;
  EventImage?: unknown;
  VenueImage?: unknown;
  ArtistImage?: unknown;
};

function toHttpsUrl(value: string | null | undefined) {
  const normalized = normalizeUrlOrNull(value);
  return normalized?.startsWith("https://") ? normalized : null;
}

function toImageRows(input: unknown): EntityImageLike[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is EntityImageLike => Boolean(item) && typeof item === "object");
}

function sortRows(rows: EntityImageLike[]) {
  return [...rows].sort((a, b) => {
    if (Boolean(b.isPrimary) !== Boolean(a.isPrimary)) return Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
    const aSort = Number(a.sortOrder ?? Number.MAX_SAFE_INTEGER);
    const bSort = Number(b.sortOrder ?? Number.MAX_SAFE_INTEGER);
    if (aSort !== bSort) return aSort - bSort;
    return 0;
  });
}

function toPublicImage(row: EntityImageLike, fallbackAlt: string | null): PublicImage | null {
  const display = resolveAssetDisplay({
    asset: row.asset ?? null,
    legacyUrl: toHttpsUrl(row.url),
    requestedVariant: "card",
  });
  const url = toHttpsUrl(display.url);
  if (!url) return null;

  return {
    url,
    alt: row.alt?.trim() || fallbackAlt,
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : Number.MAX_SAFE_INTEGER,
    isPrimary: Boolean(row.isPrimary),
    isProcessing: display.isProcessing,
    hasFailure: display.hasFailure,
  };
}

function getRelationRows(entity: EntityWithImages) {
  return toImageRows(entity.EventImage ?? entity.VenueImage ?? entity.ArtistImage ?? entity.images);
}

export function resolveEntityGallery(entity: EntityWithImages): PublicImage[] {
  const fallbackAlt = entity.title?.trim() || entity.name?.trim() || null;
  const relationRows = getRelationRows(entity);
  const relationImages = sortRows(relationRows)
    .map((row) => toPublicImage(row, fallbackAlt))
    .filter((row): row is PublicImage => Boolean(row));

  if (relationImages.length) return relationImages;

  const legacyRows = sortRows(safeParseImagesJson(entity.images));
  return legacyRows
    .map((row) => toPublicImage(row, fallbackAlt))
    .filter((row): row is PublicImage => Boolean(row));
}

export function resolveEntityPrimaryImage(entity: EntityWithImages): Omit<PublicImage, "sortOrder" | "isPrimary"> | null {
  const gallery = resolveEntityGallery(entity);
  if (gallery.length) {
    const first = gallery[0];
    return {
      url: first.url,
      alt: first.alt,
      width: first.width,
      height: first.height,
      isProcessing: first.isProcessing,
      hasFailure: first.hasFailure,
    };
  }

  const display = resolveAssetDisplay({ legacyUrl: toHttpsUrl(entity.featuredImageUrl), requestedVariant: "card" });
  const featured = toHttpsUrl(display.url);
  if (!featured) return null;
  return {
    url: featured,
    alt: entity.title?.trim() || entity.name?.trim() || null,
    width: null,
    height: null,
    isProcessing: display.isProcessing,
    hasFailure: display.hasFailure,
  };
}
