import type { GallerySource } from "@prisma/client";
import { DomExtractionStrategy } from "@/lib/ingestion/strategies/dom";
import type { DiscoveredGalleryPage, ExtractionStrategy } from "@/lib/ingestion/strategies/base";

export class SitemapExtractionStrategy extends DomExtractionStrategy implements ExtractionStrategy {
  async discoverPages(gallery: GallerySource): Promise<DiscoveredGalleryPage[]> {
    const sitemapUrl = new URL("/sitemap.xml", gallery.baseUrl).toString();
    const response = await fetch(sitemapUrl, { headers: { "user-agent": "ArtioIngestBot/2.0" } });
    if (!response.ok) return super.discoverPages(gallery);

    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]?.trim() ?? "").filter(Boolean);
    return urls.slice(0, 500).map((url) => ({ url }));
  }
}
