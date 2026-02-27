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

function scoreImgTag(tag: string): number {
  const src = (readAttr(tag, "src") ?? "").toLowerCase();
  let score = 0;
  const width = Number.parseInt(readAttr(tag, "width") ?? "", 10);
  const height = Number.parseInt(readAttr(tag, "height") ?? "", 10);
  if (Number.isFinite(width) && width >= 400) score += 3;
  if (Number.isFinite(height) && height >= 250) score += 3;
  if (src.includes("/events/") || src.includes("/event/") || src.includes("/exhibitions/")) score += 4;
  if (!isLikelyDecorative(src)) score += 2;
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
    .map((tag) => ({ src: toAbsoluteUrl(readAttr(tag, "src"), baseUrl), score: scoreImgTag(tag) }))
    .filter((row): row is { src: string; score: number } => Boolean(row.src) && !isLikelyDecorative(row.src ?? ""))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.src ?? null;
}
