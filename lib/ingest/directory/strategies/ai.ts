import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { getProvider } from "@/lib/ingest/providers";
import type { ProviderName } from "@/lib/ingest/providers";

type AiDirectoryEntity = {
  name?: string | null;
  url?: string | null;
  entityName?: string | null;
  entityUrl?: string | null;
};

const directoryExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entities"],
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url"],
        properties: {
          name: { anyOf: [{ type: "string" }, { type: "null" }] },
          url: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  "You are extracting a list of artist profiles from a directory listing page.",
  "Extract every artist or person listed on the page.",
  "For each one return their name and the URL of their profile page.",
  "Only return artists explicitly listed — do not invent or infer.",
  "If a field is not present return null.",
  "Return results in the provided schema.",
].join("\n");

export async function extractEntitiesWithAi(args: {
  html: string;
  pageUrl: string;
  baseUrl: string;
  apiKey: string;
  providerName?: ProviderName;
}): Promise<Array<{ entityUrl: string; entityName: string | null }>> {
  const provider = getProvider(args.providerName ?? "claude");
  const processedHtml = preprocessHtml(args.html);

  const result = await provider.extract({
    html: processedHtml,
    sourceUrl: args.pageUrl,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: directoryExtractionSchema,
    model: "",
    apiKey: args.apiKey,
  });

  if (!result.raw || typeof result.raw !== "object") return [];

  const raw = result.raw as { entities?: unknown };
  if (!Array.isArray(raw.entities)) return [];

  const entities: Array<{ entityUrl: string; entityName: string | null }> = [];
  const seen = new Set<string>();

  for (const item of raw.entities) {
    if (!item || typeof item !== "object") continue;
    const entry = item as AiDirectoryEntity;
    const nameValue = entry.name ?? entry.entityName;
    const urlValue = entry.url ?? entry.entityUrl;
    const name = typeof nameValue === "string" ? nameValue.trim() || null : null;
    const url = typeof urlValue === "string" ? urlValue.trim() : null;
    if (!url) continue;

    try {
      const resolved = new URL(url, args.baseUrl).toString();
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      entities.push({ entityUrl: resolved, entityName: name });
    } catch {
      continue;
    }
  }

  return entities;
}
