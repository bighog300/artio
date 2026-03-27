import type { PrismaClient } from "@prisma/client";
import { getTemplatePerfData } from "@/lib/discovery/template-perf-query";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: { openAiApiKey?: string | null; anthropicApiKey?: string | null; geminiApiKey?: string | null },
): string {
  switch (provider) {
    case "claude":
      return settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    case "gemini":
      return settings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";
    default:
      return settings.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  }
}

export type TemplateSuggestion = {
  template: string;
  rationale: string;
  isNew: boolean;
};

export async function suggestAdaptiveTemplates(
  db: PrismaClient,
  args: {
    region: string;
    country: string;
    entityType: "VENUE" | "ARTIST";
    count?: number;
    lookbackDays?: number;
  },
  providerSettings: {
    provider?: string | null;
    openAiApiKey?: string | null;
    anthropicApiKey?: string | null;
    geminiApiKey?: string | null;
    model?: string | null;
  },
): Promise<TemplateSuggestion[]> {
  const [allPerfData, seededCandidates] = await Promise.all([
    getTemplatePerfData(db, {
      lookbackDays: args.lookbackDays ?? 30,
      entityType: args.entityType,
      region: args.region,
    }),
    db.ingestDiscoveryCandidate.findMany({
      where: {
        seededVenueId: { not: null },
        job: {
          region: { equals: args.region, mode: "insensitive" },
          entityType: args.entityType,
          createdAt: {
            gte: new Date(Date.now() - (args.lookbackDays ?? 30) * 24 * 60 * 60 * 1000),
          },
        },
      },
      select: {
        seededVenue: { select: { name: true } },
        title: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const topTemplates = allPerfData.filter((r) => r.avgYield >= 0.2);
  const poorTemplates = allPerfData.filter((r) => r.jobCount >= 3 && r.avgYield < 0.1);

  const seededNames = [
    ...new Set(
      seededCandidates
        .map((c) => (c.seededVenue?.name ?? c.title ?? "").trim())
        .filter((n) => n.length > 0),
    ),
  ].slice(0, 10);

  const providerName = (providerSettings.provider ?? "openai") as ProviderName;
  const provider = getProvider(providerName);
  const apiKey = resolveProviderApiKey(provider.name, providerSettings);
  if (!apiKey) return [];

  const targetLabel = args.entityType === "VENUE" ? "art venues" : "artists";

  const contextBlock = [
    `Region: ${args.region}, ${args.country}`,
    `Entity type: ${args.entityType}`,
    "",
    "PERFORMING WELL (build on these patterns):",
    topTemplates.length > 0
      ? topTemplates
          .map((t) => `  - "${t.queryTemplate}" (yield ${(t.avgYield * 100).toFixed(0)}%)`)
          .join("\n")
      : "  None yet",
    "",
    "PERFORMING POORLY (avoid these patterns):",
    poorTemplates.length > 0
      ? poorTemplates
          .map((t) => `  - "${t.queryTemplate}" (yield ${(t.avgYield * 100).toFixed(0)}%)`)
          .join("\n")
      : "  None yet",
    "",
    "RECENTLY SEEDED NAMES (use as inspiration):",
    seededNames.length > 0
      ? seededNames.map((n) => `  - ${n}`).join("\n")
      : "  None yet",
  ].join("\n");

  try {
    const result = await provider.extract({
      html: contextBlock,
      sourceUrl: "",
      systemPrompt:
        `You are a search query strategist for an art ` +
        `discovery system. Given performance data about ` +
        `existing search queries for a region, suggest ` +
        `new search query templates that are likely to ` +
        `find undiscovered ${targetLabel}.\n\n` +
        `Rules:\n` +
        `- Each template must be 3–8 words\n` +
        `- Include the region name in the template\n` +
        `- Vary the approach: try category terms, event ` +
        `types, institution types, cultural descriptors\n` +
        `- Avoid patterns similar to poorly-performing ` +
        `templates\n` +
        `- Build on patterns from well-performing ` +
        `templates\n` +
        `- Each suggestion must be genuinely different ` +
        `from all existing templates\n` +
        `- Return exactly ${args.count ?? 5} suggestions`,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                template: { type: "string" },
                rationale: { type: "string" },
              },
              required: ["template", "rationale"],
            },
          },
        },
        required: ["suggestions"],
      },
      model: providerSettings.model ?? "",
      apiKey,
    });

    const raw = result.raw as Record<string, unknown>;
    const rawSuggestions = Array.isArray(raw?.suggestions) ? raw.suggestions : [];

    const seenTemplates = new Set([...allPerfData.map((r) => r.queryTemplate.trim().toLowerCase())]);

    const suggestions: TemplateSuggestion[] = [];
    for (const item of rawSuggestions) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as Record<string, unknown>).template !== "string" ||
        typeof (item as Record<string, unknown>).rationale !== "string"
      ) {
        continue;
      }

      const template = String((item as Record<string, unknown>).template).trim();
      const rationale = String((item as Record<string, unknown>).rationale).trim();

      if (template.length < 3 || template.length > 100 || rationale.length === 0) {
        continue;
      }

      suggestions.push({
        template,
        rationale,
        isNew: !seenTemplates.has(template.toLowerCase()),
      });

      if (suggestions.length >= (args.count ?? 5)) break;
    }

    return suggestions;
  } catch {
    return [];
  }
}
