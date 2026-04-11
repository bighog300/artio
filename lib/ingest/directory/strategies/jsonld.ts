import type { DirectoryEntity, DirectoryExtractionArgs, DirectoryExtractionStrategy } from "./base";

export type JsonLdEntity = {
  entityUrl: string;
  entityName: string | null;
};

function extractJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = [];
  const rx = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1] ?? "");
      results.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  }

  return results;
}

function collectPersonNodes(node: unknown): Array<{ name?: unknown; url?: unknown }> {
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;

  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  const isPersonOrArtist = types.some((t) => t === "Person" || t === "Artist" || t === "ProfilePage");

  const results: Array<{ name?: unknown; url?: unknown }> = [];
  if (isPersonOrArtist) results.push(obj);

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        results.push(...collectPersonNodes(item));
      }
    } else if (value && typeof value === "object") {
      results.push(...collectPersonNodes(value));
    }
  }

  return results;
}

export function extractEntitiesFromJsonLd(html: string, baseUrl: string): JsonLdEntity[] {
  const blocks = extractJsonLdBlocks(html);
  const entities: JsonLdEntity[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const nodes = collectPersonNodes(block);
    for (const node of nodes) {
      const name = typeof node.name === "string" ? node.name.trim() : null;
      const url = typeof node.url === "string" ? node.url.trim() : null;

      if (!url) continue;

      try {
        const resolved = new URL(url, baseUrl).toString();
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        entities.push({ entityUrl: resolved, entityName: name });
      } catch {
        continue;
      }
    }
  }

  return entities;
}

export function hasJsonLdPersonData(html: string): boolean {
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    if (collectPersonNodes(block).length > 0) return true;
  }
  return false;
}

export class JsonLdDirectoryStrategy implements DirectoryExtractionStrategy {
  readonly name = "jsonld";

  async extractEntities(args: DirectoryExtractionArgs): Promise<DirectoryEntity[]> {
    return extractEntitiesFromJsonLd(args.html, args.pageUrl);
  }
}
