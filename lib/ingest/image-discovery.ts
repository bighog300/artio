function readAttr(tag: string, attr: string): string | null {
  const quoted = new RegExp(`${attr}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  if (quoted?.[2]) return quoted[2].trim();
  const unquoted = new RegExp(`${attr}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  return unquoted?.[1]?.trim() ?? null;
}

function toAbsoluteUrl(raw: string | null | undefined, baseUrl?: string | null): string | null {
  if (!raw) return null;
  try {
    return baseUrl ? new URL(raw, baseUrl).toString() : new URL(raw).toString();
  } catch {
    return null;
  }
}

function isLikelyDecorative(url: string): boolean {
  const lower = url.toLowerCase();
  return ["logo", "icon", "sprite", "favicon"].some((token) => lower.includes(token));
}


function bestSrcsetUrl(srcset: string | null): string | null {
  if (!srcset) return null;
  // srcset format: "url1 width1w, url2 width2w" or "url1 1x, url2 2x"
  // Pick the entry with the highest numeric width descriptor, or last 2x entry
  let bestUrl: string | null = null;
  let bestWidth = -1;

  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const segments = trimmed.split(/\s+/);
    const url = segments[0];
    const descriptor = segments[1] ?? "";
    if (!url) continue;

    const wMatch = /^(\d+(?:\.\d+)?)w$/i.exec(descriptor);
    const xMatch = /^(\d+(?:\.\d+)?)x$/i.exec(descriptor);

    if (wMatch) {
      const w = Number.parseFloat(wMatch[1]);
      if (w > bestWidth) {
        bestWidth = w;
        bestUrl = url;
      }
    } else if (xMatch) {
      // For x-descriptors, prefer higher density; treat 1x = 100w, 2x = 200w
      const w = Number.parseFloat(xMatch[1]) * 100;
      if (w > bestWidth) {
        bestWidth = w;
        bestUrl = url;
      }
    } else if (bestUrl === null) {
      // No descriptor — bare URL, use as fallback
      bestUrl = url;
    }
  }

  return bestUrl;
}

function resolveImgSrc(tag: string): string | null {
  // Priority: srcset (best width) > data-src > data-lazy-src > src
  const srcset = readAttr(tag, "srcset");
  const srcsetUrl = bestSrcsetUrl(srcset);
  if (srcsetUrl) return srcsetUrl;

  const dataSrc = readAttr(tag, "data-src");
  if (dataSrc) return dataSrc;

  const dataLazySrc = readAttr(tag, "data-lazy-src");
  if (dataLazySrc) return dataLazySrc;

  return readAttr(tag, "src");
}

function scoreImgTag(tag: string): number {
  const src = (resolveImgSrc(tag) ?? "").toLowerCase();
  let score = 0;
  const width = Number.parseInt(readAttr(tag, "width") ?? "", 10);
  const height = Number.parseInt(readAttr(tag, "height") ?? "", 10);
  if (Number.isFinite(width) && width >= 400) score += 3;
  if (Number.isFinite(height) && height >= 250) score += 3;
  if (src.includes("/events/") || src.includes("/event/") || src.includes("/exhibitions/")) score += 4;
  if (src && !isLikelyDecorative(src)) score += 2;
  return score;
}

export function discoverEventImageUrl(args: {
  candidateImageUrl?: string | null;
  sourceUrl?: string | null;
  venueWebsiteUrl?: string | null;
  html?: string | null;
}): string | null {
  const baseUrl = args.sourceUrl ?? args.venueWebsiteUrl ?? null;
  const explicit = toAbsoluteUrl(args.candidateImageUrl, baseUrl);
  if (explicit) return explicit;

  const html = args.html ?? "";

  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = (readAttr(tag, "property") ?? readAttr(tag, "name") ?? "").toLowerCase();
    if (property !== "og:image" && property !== "twitter:image") continue;
    const content = toAbsoluteUrl(readAttr(tag, "content"), baseUrl);
    if (content) return content;
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const ranked = imgTags
    .map((tag) => ({ src: toAbsoluteUrl(resolveImgSrc(tag), baseUrl), score: scoreImgTag(tag) }))
    .filter((row): row is { src: string; score: number } => Boolean(row.src) && !isLikelyDecorative(row.src ?? ""))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.src ?? null;
}
