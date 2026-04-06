import type { GallerySource } from "@prisma/client";
import type { ExtractionResult } from "@/lib/ingestion/types";

export type DiscoveredGalleryPage = {
  url: string;
  title?: string | null;
};

export interface ExtractionStrategy {
  discoverPages(gallery: GallerySource): Promise<DiscoveredGalleryPage[]>;
  extract(params: { pageUrl: string; html: string; gallery: GallerySource }): Promise<ExtractionResult>;
}
