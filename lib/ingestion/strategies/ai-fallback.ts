import { createHash } from "node:crypto";
import type { GallerySource } from "@prisma/client";
import type { DiscoveredGalleryPage, ExtractionStrategy } from "@/lib/ingestion/strategies/base";
import type { ExtractionResult } from "@/lib/ingestion/types";

export class AiFallbackExtractionStrategy implements ExtractionStrategy {
  async discoverPages(gallery: GallerySource): Promise<DiscoveredGalleryPage[]> {
    return [{ url: gallery.eventsPageUrl ?? gallery.baseUrl, title: "fallback" }];
  }

  async extract(params: { pageUrl: string; html: string; gallery: GallerySource }): Promise<ExtractionResult> {
    const text = params.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const title = text.slice(0, 140) || `${params.gallery.name} listing`;
    return {
      events: [{ title, sourceUrl: params.pageUrl, artistNames: [], artworks: [] }],
      artists: [],
      artworks: [],
      contentHash: createHash("sha256").update(params.html).digest("hex"),
    };
  }
}
