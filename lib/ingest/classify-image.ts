import { logWarn } from "@/lib/logging";

export type ImageType =
  | "profile"
  | "artwork"
  | "poster"
  | "venue"
  | "unknown";

export type ClassifiedImage = {
  url: string;
  imageType: ImageType;
  confidence: number;
  altText: string | null;
  width: number | null;
  height: number | null;
};

type RawImageCandidate = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
  cssClass?: string | null;
  surroundingText?: string | null;
  isAboveFold?: boolean;
  position?: number;
};

const PROFILE_SIGNALS = [
  "portrait", "headshot", "profile", "photo of", "picture of",
  "artist photo", "about the artist", "meet the", "avatar",
];

const ARTWORK_SIGNALS = [
  "artwork", "painting", "sculpture", "print", "drawing",
  "oil on canvas", "acrylic", "mixed media", "watercolour",
  "watercolor", "etching", "lithograph", "for sale", "cm", "×",
  "edition", "series",
];

const POSTER_SIGNALS = [
  "exhibition", "show", "opening", "presents", "gallery",
  "event", "invite", "opening night", "vernissage", "poster",
  "flyer", "announcement",
];

const VENUE_SIGNALS = [
  "gallery", "museum", "exterior", "interior", "building",
  "space", "venue", "entrance", "facade",
];

const NOISE_SIGNALS = [
  "logo", "icon", "banner", "nav", "header", "footer",
  "sponsor", "partner", "badge", "button", "arrow",
];

function scoreSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  return signals.filter((signal) => lower.includes(signal)).length;
}

function isLikelyNoise(candidate: RawImageCandidate): boolean {
  const text = [
    candidate.altText ?? "",
    candidate.cssClass ?? "",
    candidate.surroundingText ?? "",
  ].join(" ").toLowerCase();

  return NOISE_SIGNALS.some((signal) => text.includes(signal));
}

function classifyByDimensions(width: number | null, height: number | null): ImageType | null {
  if (!width || !height) return null;

  const ratio = width / height;
  const area = width * height;

  if (area < 10000) return "unknown";
  if (ratio >= 0.8 && ratio <= 1.25 && area < 160000) return "profile";
  if (ratio >= 1.5 && ratio <= 2.5 && area > 100000) return "poster";
  if (ratio < 0.9 && area > 90000) return "artwork";

  return null;
}

export function classifyImageRule(candidate: RawImageCandidate): ClassifiedImage {
  const url = candidate.url;

  if (isLikelyNoise(candidate)) {
    return {
      url,
      imageType: "unknown",
      confidence: 80,
      altText: candidate.altText ?? null,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
    };
  }

  const contextText = [
    candidate.altText ?? "",
    candidate.cssClass ?? "",
    candidate.surroundingText ?? "",
  ].join(" ");

  const profileScore = scoreSignals(contextText, PROFILE_SIGNALS);
  const artworkScore = scoreSignals(contextText, ARTWORK_SIGNALS);
  const posterScore = scoreSignals(contextText, POSTER_SIGNALS);
  const venueScore = scoreSignals(contextText, VENUE_SIGNALS);

  if (candidate.isAboveFold && candidate.position === 0 && artworkScore === 0 && posterScore === 0) {
    return {
      url,
      imageType: "profile",
      confidence: 65,
      altText: candidate.altText ?? null,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
    };
  }

  const dimensionType = classifyByDimensions(candidate.width ?? null, candidate.height ?? null);

  const scores: Record<ImageType, number> = {
    profile: profileScore * 20 + (dimensionType === "profile" ? 30 : 0),
    artwork: artworkScore * 20 + (dimensionType === "artwork" ? 30 : 0),
    poster: posterScore * 20 + (dimensionType === "poster" ? 30 : 0),
    venue: venueScore * 20,
    unknown: 10,
  };

  const best = (Object.entries(scores) as [ImageType, number][]).sort(([, a], [, b]) => b - a)[0];
  const imageType = best[0];
  const rawConfidence = best[1];
  const confidence = Math.min(95, Math.max(10, rawConfidence));

  return {
    url,
    imageType: rawConfidence > 10 ? imageType : "unknown",
    confidence,
    altText: candidate.altText ?? null,
    width: candidate.width ?? null,
    height: candidate.height ?? null,
  };
}

export function extractImageCandidates(html: string, baseUrl: string): RawImageCandidate[] {
  const candidates: RawImageCandidate[] = [];
  const seen = new Set<string>();

  const imgRx = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let position = 0;

  while ((match = imgRx.exec(html)) !== null) {
    const attrs = match[1] ?? "";

    const src =
      /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim()
      || /\bdata-src\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim()
      || /\bsrcset\s*=\s*["']([^"'?\s]+)/i.exec(attrs)?.[1]?.trim();

    if (!src || src.startsWith("data:")) continue;

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }

    if (/\/(icon|logo|favicon|sprite|pixel|tracking|1x1)\b/i.test(resolvedUrl)) continue;
    if (/\.(svg|gif)(\?|$)/i.test(resolvedUrl)) continue;
    if (seen.has(resolvedUrl)) continue;
    seen.add(resolvedUrl);

    const altText = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() || null;
    const cssClass = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() || null;
    const widthAttr = /\bwidth\s*=\s*["']?(\d+)["']?/i.exec(attrs)?.[1];
    const heightAttr = /\bheight\s*=\s*["']?(\d+)["']?/i.exec(attrs)?.[1];

    const surroundingStart = Math.max(0, match.index - 100);
    const surroundingText = html
      .slice(surroundingStart, match.index)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-80);

    candidates.push({
      url: resolvedUrl,
      altText: altText || null,
      width: widthAttr ? Number.parseInt(widthAttr, 10) : null,
      height: heightAttr ? Number.parseInt(heightAttr, 10) : null,
      cssClass: cssClass || null,
      surroundingText: surroundingText || null,
      isAboveFold: position < 3,
      position,
    });

    position += 1;
  }

  return candidates;
}

export function classifyPageImages(html: string, baseUrl: string): ClassifiedImage[] {
  try {
    const candidates = extractImageCandidates(html, baseUrl);
    return candidates.map((candidate) => classifyImageRule(candidate));
  } catch (error) {
    logWarn({
      message: "classify_page_images_failed",
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function pickBestImages(images: ClassifiedImage[]): {
  profile: ClassifiedImage | null;
  artwork: ClassifiedImage[];
  poster: ClassifiedImage | null;
  venue: ClassifiedImage | null;
} {
  const byType = (type: ImageType) => images
    .filter((image) => image.imageType === type)
    .sort((a, b) => b.confidence - a.confidence);

  const artworks = byType("artwork").slice(0, 10);
  const profiles = byType("profile");
  const posters = byType("poster");
  const venues = byType("venue");

  return {
    profile: profiles[0] ?? null,
    artwork: artworks,
    poster: posters[0] ?? null,
    venue: venues[0] ?? null,
  };
}
