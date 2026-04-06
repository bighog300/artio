import { AiFallbackExtractionStrategy } from "@/lib/ingestion/strategies/ai-fallback";
import { DomExtractionStrategy } from "@/lib/ingestion/strategies/dom";
import { SitemapExtractionStrategy } from "@/lib/ingestion/strategies/sitemap";
import { WordPressExtractionStrategy } from "@/lib/ingestion/strategies/wordpress";
import type { ExtractionStrategy } from "@/lib/ingestion/strategies/base";

const dom = new DomExtractionStrategy();
const wordpress = new WordPressExtractionStrategy();
const sitemap = new SitemapExtractionStrategy();
const aiFallback = new AiFallbackExtractionStrategy();

export function getStrategy(platformType: string | null | undefined): ExtractionStrategy {
  if (!platformType) return dom;
  if (platformType === "wordpress") return wordpress;
  if (platformType === "sitemap") return sitemap;
  if (platformType === "ai") return aiFallback;
  return dom;
}
