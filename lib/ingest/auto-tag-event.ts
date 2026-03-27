import { PrismaClient } from "@prisma/client";
import { IngestError } from "@/lib/ingest/errors";
import { getProvider, type ProviderName } from "@/lib/ingest/providers/index";
import { logError } from "@/lib/logging";

const autoTagSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tags"],
  properties: {
    tags: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
  },
} as const;

const systemPrompt = "You are an expert art curator. Given an art event title and description, select the most relevant tags from the provided taxonomy. Return only slugs that appear exactly in the taxonomy list. Select between 2 and 8 tags. Prefer specific tags over general ones. Do not invent tags. If nothing fits, return an empty array.";

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: {
    geminiApiKey?: string | null;
    anthropicApiKey?: string | null;
    openAiApiKey?: string | null;
  },
): string {
  switch (provider) {
    case "gemini": {
      const key = settings.geminiApiKey ?? process.env.GEMINI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Gemini provider selected but GEMINI_API_KEY is not set");
      return key;
    }
    case "claude": {
      const key = settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "Claude provider selected but ANTHROPIC_API_KEY is not set");
      return key;
    }
    default: {
      const key = settings.openAiApiKey ?? process.env.OPENAI_API_KEY;
      if (!key) throw new IngestError("CONFIG_ERROR", "OpenAI provider selected but OPENAI_API_KEY is not set");
      return key;
    }
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function autoTagEvent(args: {
  db: PrismaClient;
  eventId: string;
  title: string;
  description: string | null;
  settings: {
    autoTagProvider?: string | null;
    autoTagModel?: string | null;
    geminiApiKey?: string | null;
    anthropicApiKey?: string | null;
    openAiApiKey?: string | null;
  };
}): Promise<{ tagged: number; skipped: number }> {
  try {
    const title = args.title.trim();
    const description = args.description?.trim() ?? "";
    if (!title && !description) return { tagged: 0, skipped: 0 };

    const tags = await args.db.tag.findMany({
      select: { id: true, name: true, slug: true, category: true },
    });
    if (tags.length === 0) return { tagged: 0, skipped: 0 };

    const grouped = new Map<string, string[]>();
    for (const tag of tags) {
      const existing = grouped.get(tag.category) ?? [];
      existing.push(tag.slug);
      grouped.set(tag.category, existing);
    }

    const categoryLabel = new Map<string, string>([
      ["medium", "Medium"],
      ["genre", "Genre"],
      ["movement", "Movement"],
      ["mood", "Mood"],
    ]);

    const orderedCategories = ["medium", "genre", "movement", "mood"];
    const orderedCategoryRows = orderedCategories
      .filter((category) => grouped.has(category))
      .map((category) => `${categoryLabel.get(category) ?? category}: ${(grouped.get(category) ?? []).join(", ")}`);

    const remainingRows = Array.from(grouped.entries())
      .filter(([category]) => !orderedCategories.includes(category))
      .map(([category, slugs]) => `${category}: ${slugs.join(", ")}`);

    const tagListString = [...orderedCategoryRows, ...remainingRows].join("\n");

    const provider = getProvider((args.settings.autoTagProvider as ProviderName | null) ?? "openai");
    const resolvedKey = resolveProviderApiKey(provider.name, args.settings);
    const resolvedModel = args.settings.autoTagModel ?? "";

    const userContent = `Event title: ${title}\n\nDescription: ${args.description ?? "(no description)"}\n\n\nAvailable tags by category:\n${tagListString}\n\n\nReturn only slugs from the list above.`;

    const result = await provider.extract({
      html: userContent,
      sourceUrl: "",
      systemPrompt,
      jsonSchema: autoTagSchema,
      model: resolvedModel,
      apiKey: resolvedKey,
      maxOutputTokens: 256,
    });

    const raw = result.raw && typeof result.raw === "object" ? result.raw as Record<string, unknown> : null;
    const tagsFromModel = raw ? asStringArray(raw.tags) : [];

    const tagBySlug = new Map(tags.map((tag) => [tag.slug, tag]));
    const matchedTags = tagsFromModel
      .map((slug) => tagBySlug.get(slug))
      .filter((tag): tag is { id: string; name: string; slug: string; category: string } => Boolean(tag));

    if (matchedTags.length === 0) return { tagged: 0, skipped: 0 };

    await args.db.eventTag.createMany({
      data: matchedTags.map((tag) => ({ eventId: args.eventId, tagId: tag.id })),
      skipDuplicates: true,
    });

    return { tagged: matchedTags.length, skipped: tagsFromModel.length - matchedTags.length };
  } catch (error) {
    logError({ message: "auto_tag_error", error });
    return { tagged: 0, skipped: 0 };
  }
}
