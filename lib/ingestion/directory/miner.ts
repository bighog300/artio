import { db } from "@/lib/db";
import { enqueueIngestionJob } from "@/lib/ingestion/jobs/queue";
import { logInfo } from "@/lib/logging";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function buildDirectoryPageUrl(indexPattern: string, letter: string, page: number): string {
  return indexPattern.replace("{letter}", letter).replace("{page}", String(page));
}

export async function enqueueDirectoryMining(sourceId: string): Promise<{ queued: number }> {
  const source = await db.directorySource.findUnique({ where: { id: sourceId } });
  if (!source || !source.isActive) return { queued: 0 };

  const cursor = await db.directoryCursor.upsert({
    where: { directorySourceId: sourceId },
    create: {
      directorySourceId: sourceId,
      currentLetter: "A",
      currentPage: 1,
      lastRunAt: null,
    },
    update: {},
  });

  let queued = 0;
  const startIndex = Math.max(0, LETTERS.indexOf(cursor.currentLetter));

  for (let idx = startIndex; idx < LETTERS.length; idx += 1) {
    const letter = LETTERS[idx];
    const startPage = letter === cursor.currentLetter ? cursor.currentPage : 1;

    for (let page = startPage; page <= source.maxPagesPerLetter; page += 1) {
      const url = buildDirectoryPageUrl(source.indexPattern, letter, page);
      const enqueued = await enqueueIngestionJob("directory-page", { directorySourceId: source.id, letter, page, url }, {
        idempotencyKey: `${source.id}:${letter}:${page}`,
      });
      if (enqueued.enqueued) queued += 1;
    }
  }

  await db.directoryCursor.update({
    where: { directorySourceId: sourceId },
    data: { queuedAt: new Date(), lastRunAt: new Date() },
  });

  logInfo({ message: "directory_mining_enqueued", sourceId, queued });
  return { queued };
}

export function extractEntityLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const rx = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      links.add(resolved.toString());
    } catch {
      continue;
    }
  }
  return [...links];
}
