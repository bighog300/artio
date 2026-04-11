import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import type { DirectoryEntity, DirectoryExtractionArgs, DirectoryExtractionStrategy } from "./base";

function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const rx = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(xml)) !== null) {
    const url = match[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

function isProfileUrl(url: string, linkPattern: string | null | undefined, baseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (
      parsed.hostname !== base.hostname
      && parsed.hostname !== `www.${base.hostname}`
      && `www.${parsed.hostname}` !== base.hostname
    ) return false;
    if (linkPattern) return new RegExp(linkPattern, "i").test(parsed.pathname);

    const parts = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return false;
    if (/^\d{4}$/.test(parts[parts.length - 1] ?? "")) return false;
    return true;
  } catch {
    return false;
  }
}

export class SitemapDirectoryStrategy implements DirectoryExtractionStrategy {
  readonly name = "sitemap";

  async extractEntities(args: DirectoryExtractionArgs): Promise<DirectoryEntity[]> {
    const sitemapUrl = new URL("/sitemap.xml", args.baseUrl).toString();
    let xml: string;

    try {
      const fetched = await fetchHtmlWithGuards(sitemapUrl);
      xml = fetched.html;
    } catch {
      return [];
    }

    const isIndex = xml.includes("<sitemapindex");
    if (isIndex) {
      const subSitemapUrls = parseSitemapUrls(xml).slice(0, 5);
      const allEntities: DirectoryEntity[] = [];
      for (const subUrl of subSitemapUrls) {
        try {
          const sub = await fetchHtmlWithGuards(subUrl);
          const subUrls = parseSitemapUrls(sub.html);
          for (const url of subUrls) {
            if (isProfileUrl(url, args.linkPattern, args.baseUrl)) {
              allEntities.push({ entityUrl: url, entityName: null });
            }
          }
        } catch {
          continue;
        }
      }
      return allEntities;
    }

    return parseSitemapUrls(xml)
      .filter((url) => isProfileUrl(url, args.linkPattern, args.baseUrl))
      .map((url) => ({ entityUrl: url, entityName: null }));
  }
}
