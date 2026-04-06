import type { GallerySource } from "@prisma/client";
import { DomExtractionStrategy } from "@/lib/ingestion/strategies/dom";
import type { DiscoveredGalleryPage, ExtractionStrategy } from "@/lib/ingestion/strategies/base";

export class WordPressExtractionStrategy extends DomExtractionStrategy implements ExtractionStrategy {
  async discoverPages(gallery: GallerySource): Promise<DiscoveredGalleryPage[]> {
    const apiUrl = new URL("/wp-json/wp/v2/pages?per_page=100", gallery.baseUrl).toString();
    const response = await fetch(apiUrl, { headers: { "user-agent": "ArtioIngestBot/2.0" } });
    if (!response.ok) {
      return super.discoverPages(gallery);
    }

    const pages = await response.json() as Array<{ link?: string; title?: { rendered?: string } }>;
    return pages
      .map((page) => ({ url: page.link ?? "", title: page.title?.rendered ?? null }))
      .filter((page) => Boolean(page.url));
  }
}
