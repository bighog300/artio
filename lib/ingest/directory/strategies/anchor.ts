import type { DirectoryEntity, DirectoryExtractionArgs, DirectoryExtractionStrategy } from "./base";

const NAV_LABELS = new Set([
  "home", "about", "contact", "privacy", "terms", "login",
  "sign in", "sign up", "artists", "venues", "next", "previous",
  "back", "menu", "search", "shop", "blog", "news",
]);

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function isPlausibleName(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 140 || normalized.length < 2) return false;
  const lower = normalized.toLowerCase();
  if (NAV_LABELS.has(lower)) return false;
  if (/^[0-9\W_]+$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function isProfilePath(pathname: string, baseUrl: string, linkPattern: string | null | undefined): boolean {
  try {
    if (linkPattern) {
      return new RegExp(linkPattern, "i").test(pathname);
    }
    const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
    if (!pathname.toLowerCase().startsWith(basePath.toLowerCase())) return false;
    const remainder = pathname.slice(basePath.length);
    if (/^\/[a-zA-Z]?\/?$/.test(remainder)) return false;
    if (/\/(page|p)\/\d+/.test(remainder)) return false;
    return remainder.replace(/^\//, "").length > 1;
  } catch {
    return false;
  }
}

export class AnchorDirectoryStrategy implements DirectoryExtractionStrategy {
  readonly name = "anchor";

  async extractEntities(args: DirectoryExtractionArgs): Promise<DirectoryEntity[]> {
    const entities: DirectoryEntity[] = [];
    const seen = new Set<string>();
    const base = new URL(args.baseUrl);
    const sourceHost = base.hostname.toLowerCase().replace(/^www\./, "");
    const rx = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = rx.exec(args.html)) !== null) {
      const href = match[1]?.trim();
      const text = stripTags(match[2] ?? "");
      if (!href || !isPlausibleName(text)) continue;

      try {
        const resolved = new URL(href, base);
        const resolvedHost = resolved.hostname.toLowerCase().replace(/^www\./, "");
        if (resolvedHost !== sourceHost) continue;
        if (!isProfilePath(resolved.pathname, args.baseUrl, args.linkPattern)) continue;
        if (seen.has(resolved.toString())) continue;
        seen.add(resolved.toString());
        entities.push({ entityUrl: resolved.toString(), entityName: text || null });
      } catch {
        continue;
      }
    }

    return entities;
  }
}
