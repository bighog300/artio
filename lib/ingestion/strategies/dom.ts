import { createHash } from "node:crypto";
import type { GallerySource } from "@prisma/client";
import { normalizeArtistName } from "@/lib/ingestion/matching/normalize";
import type { ExtractionResult } from "@/lib/ingestion/types";
import type { DiscoveredGalleryPage, ExtractionStrategy } from "@/lib/ingestion/strategies/base";

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function discoverAnchorUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const rx = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
    try {
      const resolved = new URL(href, baseUrl).toString();
      urls.add(resolved);
    } catch {
      continue;
    }
  }
  return [...urls];
}

function extractEventsFromText(text: string, sourceUrl: string): ExtractionResult {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const events = lines
    .filter((line) => /exhibition|opening|fair|show|residency|talk/i.test(line) && line.length > 8)
    .slice(0, 50)
    .map((title) => ({ title, sourceUrl, artistNames: [], artworks: [] }));

  return {
    events,
    artists: [],
    artworks: [],
    contentHash: createHash("sha256").update(text).digest("hex"),
  };
}

export class DomExtractionStrategy implements ExtractionStrategy {
  async discoverPages(gallery: GallerySource): Promise<DiscoveredGalleryPage[]> {
    const response = await fetch(gallery.baseUrl, { headers: { "user-agent": "ArtioIngestBot/2.0" } });
    if (!response.ok) throw new Error(`dom_discover_failed:${response.status}`);
    const html = await response.text();
    return discoverAnchorUrls(html, gallery.baseUrl).slice(0, 200).map((url) => ({ url }));
  }

  async extract(params: { pageUrl: string; html: string; gallery: GallerySource }): Promise<ExtractionResult> {
    const text = stripTags(params.html);
    const result = extractEventsFromText(text, params.pageUrl);

    const artistMatches = [...text.matchAll(/(?:artist|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g)].slice(0, 80);
    result.artists = artistMatches.map((match) => {
      const rawName = match[1]?.trim() ?? "";
      return { name: rawName, normalizedName: normalizeArtistName(rawName), confidence: 0.45 };
    }).filter((artist) => artist.normalizedName.length > 1);

    for (const event of result.events) {
      const pairedArtists = result.artists.slice(0, 2).map((artist) => artist.name);
      event.artistNames = pairedArtists;
    }

    return result;
  }
}
