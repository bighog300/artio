import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";

const ROUTE = "/api/cron/artworks/autotag";
const CRON_NAME = "autotag_artworks";
const BATCH_SIZE = 10;
const DEFAULT_AUTOTAG_SYSTEM_PROMPT = `You are an art
classification assistant. Given artwork metadata and a list
of available tags grouped by category, return a JSON object
with a "tags" array containing the slug values of the most
relevant tags (maximum 5). Only use slugs from the provided
list. If no tags are relevant, return an empty array.`;

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function withNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function resolveProviderApiKey(
  provider: "openai" | "gemini" | "claude",
  settings: {
    openAiApiKey?: string | null;
    anthropicApiKey?: string | null;
    geminiApiKey?: string | null;
  },
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

export async function runCronAutotagArtworks(
  cronSecret: string | null,
  { db }: { db: PrismaClient },
): Promise<Response> {
  const authFailure = validateCronRequest(cronSecret, { route: ROUTE });
  if (authFailure) return withNoStore(authFailure);

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();

  const settings = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      autoTagEnabled: true,
      autoTagProvider: true,
      autoTagModel: true,
      openAiApiKey: true,
      anthropicApiKey: true,
      geminiApiKey: true,
    },
  });

  if (!settings?.autoTagEnabled) {
    return noStoreJson({
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      skipped: true,
      reason: "autoTagEnabled is false",
    });
  }

  const hasApiKey =
    settings?.openAiApiKey ||
    settings?.anthropicApiKey ||
    settings?.geminiApiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!hasApiKey) {
    return noStoreJson({
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      skipped: true,
      reason: "no_api_key_configured",
    });
  }

  const lock = await tryAcquireCronLock(db, "cron:artwork:autotag");
  if (!lock.acquired) {
    const summary = {
      ok: false,
      reason: "lock_not_acquired",
      cronName: CRON_NAME,
      cronRunId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      processedCount: 0,
      errorCount: 0,
      dryRun: false,
      lock: "skipped" as const,
      tagged: 0,
      skipped: 0,
      failed: 0,
      autoTagDisabled: false,
    };

    logCronSummary(summary);
    return noStoreJson(summary);
  }

  let tagged = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const allTags = await db.tag.findMany({
      select: { id: true, slug: true, name: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    if (allTags.length === 0) {
      const summary = {
        ok: true,
        cronName: CRON_NAME,
        cronRunId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        processedCount: 0,
        errorCount: 0,
        dryRun: false,
        lock: "acquired" as const,
        tagged,
        skipped,
        failed,
        autoTagDisabled: false,
      };
      logCronSummary(summary);
      return noStoreJson(summary);
    }

    const tagsByCategory = allTags.reduce<Record<string, Array<{ slug: string; name: string }>>>(
      (acc, tag) => {
        if (!acc[tag.category]) acc[tag.category] = [];
        acc[tag.category].push({ slug: tag.slug, name: tag.name });
        return acc;
      },
      {},
    );

    const tagListText = Object.entries(tagsByCategory)
      .map(([category, tags]) => `${category}: ${tags.map((tag) => `${tag.slug} (${tag.name})`).join(", ")}`)
      .join("\n");

    const artworks = await db.artwork.findMany({
      where: {
        isPublished: true,
        deletedAt: null,
        tags: { none: {} },
      },
      select: {
        id: true,
        title: true,
        medium: true,
        year: true,
        description: true,
        artist: { select: { name: true } },
      },
      orderBy: { completenessScore: "desc" },
      take: BATCH_SIZE,
    });

    const provider = getProvider((settings.autoTagProvider as ProviderName | null) ?? "openai");
    const apiKey = resolveProviderApiKey(provider.name, settings);

    if (!apiKey) {
      const summary = {
        ok: true,
        cronName: CRON_NAME,
        cronRunId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        processedCount: 0,
        errorCount: 0,
        dryRun: false,
        lock: "acquired" as const,
        tagged,
        skipped,
        failed,
        autoTagDisabled: false,
      };
      logCronSummary(summary);
      return noStoreJson(summary);
    }

    const tagSlugToId = new Map(allTags.map((tag) => [tag.slug, tag.id]));

    for (const artwork of artworks) {
      try {
        const userPrompt = [
          `Title: ${artwork.title}`,
          artwork.artist?.name ? `Artist: ${artwork.artist.name}` : null,
          artwork.medium ? `Medium: ${artwork.medium}` : null,
          artwork.year ? `Year: ${artwork.year}` : null,
          artwork.description ? `Description: ${artwork.description.slice(0, 200)}` : null,
          "",
          "Available tags:",
          tagListText,
        ]
          .filter((value): value is string => value !== null)
          .join("\n");

        const result = await provider.extract({
          html: userPrompt,
          sourceUrl: "",
          systemPrompt: DEFAULT_AUTOTAG_SYSTEM_PROMPT,
          jsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              tags: {
                type: "array",
                items: { type: "string" },
                maxItems: 5,
              },
            },
            required: ["tags"],
          },
          model: settings.autoTagModel ?? "",
          apiKey,
        });

        const raw = result.raw as Record<string, unknown> | null;
        const returnedSlugs = Array.isArray(raw?.tags)
          ? raw.tags.filter((value): value is string => typeof value === "string")
          : [];

        const validTagIds = Array.from(new Set(returnedSlugs))
          .map((slug) => tagSlugToId.get(slug))
          .filter((tagId): tagId is string => Boolean(tagId));

        if (validTagIds.length > 0) {
          await db.artworkTag.createMany({
            data: validTagIds.map((tagId) => ({ artworkId: artwork.id, tagId })),
            skipDuplicates: true,
          });
          tagged += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("cron_autotag_artworks_failed", {
          artworkId: artwork.id,
          error,
        });
      }
    }
  } finally {
    await lock.release();
  }

  const summary = {
    ok: true,
    cronName: CRON_NAME,
    cronRunId,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    processedCount: tagged,
    errorCount: failed,
    dryRun: false,
    lock: "acquired" as const,
    tagged,
    skipped,
    failed,
    autoTagDisabled: false,
  };

  logCronSummary(summary);
  return noStoreJson(summary);
}
