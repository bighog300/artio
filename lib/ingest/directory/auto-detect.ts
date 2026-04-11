import type { ProviderName } from "@/lib/ingest/providers";
import { AiDirectoryStrategy } from "./strategies/ai";
import { AnchorDirectoryStrategy } from "./strategies/anchor";
import type { DirectoryExtractionStrategy } from "./strategies/base";
import { JsonLdDirectoryStrategy, hasJsonLdPersonData } from "./strategies/jsonld";
import { SitemapDirectoryStrategy } from "./strategies/sitemap";

export type { DirectoryExtractionStrategy };

export function buildStrategyChain(args: {
  html: string;
  linkPattern?: string | null;
  aiApiKey?: string | null;
  aiProviderName?: ProviderName;
}): DirectoryExtractionStrategy[] {
  const chain: DirectoryExtractionStrategy[] = [];

  if (hasJsonLdPersonData(args.html)) {
    chain.push(new JsonLdDirectoryStrategy());
  }

  chain.push(new SitemapDirectoryStrategy());
  chain.push(new AnchorDirectoryStrategy());

  if (args.aiApiKey) {
    chain.push(new AiDirectoryStrategy(args.aiApiKey, args.aiProviderName ?? "claude"));
  }

  return chain;
}

export function detectStrategyName(html: string, linkPattern?: string | null): string {
  if (hasJsonLdPersonData(html)) return "jsonld";
  if (linkPattern) return "anchor";
  if (html.length > 5000) return "anchor";
  return "ai";
}
