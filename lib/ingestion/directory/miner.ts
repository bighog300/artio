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

export function extractNamesFromDirectoryHtml(html: string, baseUrl: string): string[] {
  const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");
  const results: string[] = [];
  const seen = new Set<string>();
  const rx = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html)) !== null) {
    const href = match[1]?.trim() ?? "";
    const rawText = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!rawText || rawText.length > 80) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname.replace(/^www\./, "") !== baseHostname) continue;
      if (!/\/artists?\//i.test(resolved.pathname)) continue;
    } catch {
      continue;
    }

    const normalised = normaliseDirectoryName(rawText);
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    results.push(normalised);
  }

  return results;
}

export function normaliseDirectoryName(raw: string): string | null {
  const toTitleCaseWords = (value: string): string => value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 80) return null;

  const commaMatch = trimmed.match(/^([A-Z][A-Z\s'-]+),\s*(.+)$/);
  if (commaMatch) {
    const surname = commaMatch[1].trim();
    const first = commaMatch[2].trim();
    const normSurname = surname === surname.toUpperCase()
      ? toTitleCaseWords(surname)
      : surname;
    const normFirst = first === first.toUpperCase()
      ? toTitleCaseWords(first)
      : first;
    return `${normFirst} ${normSurname}`.trim();
  }

  if (/^[A-Z\u00C0-\u024F]/.test(trimmed) && /\s/.test(trimmed)) return trimmed;

  return null;
}
