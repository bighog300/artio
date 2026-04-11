import { hasJsonLdPersonData } from "@/lib/ingest/directory/strategies/jsonld";

export type DirectoryExtractionStrategy = "jsonld" | "anchor" | "ai";

function countAnchorMatches(html: string, linkPattern: string | null): number {
  if (!linkPattern) return 0;

  try {
    const rx = new RegExp(linkPattern, "gi");
    return (html.match(rx) ?? []).length;
  } catch {
    return 0;
  }
}

export function detectDirectoryStrategy(args: { html: string; linkPattern?: string | null }): DirectoryExtractionStrategy {
  if (hasJsonLdPersonData(args.html)) return "jsonld";

  if (args.linkPattern && countAnchorMatches(args.html, args.linkPattern) >= 3) {
    return "anchor";
  }

  if (args.html.length > 5000) return "anchor";

  return "ai";
}
