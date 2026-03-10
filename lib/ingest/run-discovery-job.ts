import type { PrismaClient } from "@prisma/client";
import { getSearchProvider } from "@/lib/ingest/search";
import { assertSafeUrl } from "@/lib/ingest/url-guard";

function buildQuery(queryTemplate: string, region: string): string {
  const trimmedRegion = region.trim();
  if (trimmedRegion) {
    return queryTemplate.replaceAll("[region]", trimmedRegion).trim();
  }

  return queryTemplate.replaceAll(/\s*\[region\]\s*/g, " ").replace(/\s+/g, " ").trim();
}

export async function runDiscoveryJob(args: {
  db: PrismaClient;
  jobId: string;
  env: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    braveSearchApiKey?: string | null;
  };
}): Promise<{ found: number; queued: number; skipped: number }> {
  const job = await args.db.ingestDiscoveryJob.findUnique({ where: { id: args.jobId } });
  if (!job || job.status !== "PENDING") return { found: 0, queued: 0, skipped: 0 };

  await args.db.ingestDiscoveryJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", updatedAt: new Date() },
  });

  const query = buildQuery(job.queryTemplate, job.region);

  let results: Array<{ url: string; title: string; snippet: string }> = [];
  try {
    const provider = getSearchProvider(job.searchProvider, args.env);
    results = await provider.search(query, job.maxResults);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await args.db.ingestDiscoveryJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, updatedAt: new Date() },
    });
    return { found: 0, queued: 0, skipped: 0 };
  }

  let queued = 0;
  let skipped = 0;

  for (const result of results) {
    try {
      await assertSafeUrl(result.url);
    } catch {
      await args.db.ingestDiscoveryCandidate.create({
        data: {
          jobId: job.id,
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          status: "SKIPPED",
          skipReason: "url_unsafe",
        },
      });
      skipped += 1;
      continue;
    }

    let known = false;
    if (job.entityType === "VENUE") {
      known = Boolean(await args.db.venue.findFirst({ where: { websiteUrl: result.url }, select: { id: true } }));
    } else if (job.entityType === "ARTIST") {
      known = Boolean(await args.db.artist.findFirst({ where: { websiteUrl: result.url }, select: { id: true } }));
    }

    if (known) {
      await args.db.ingestDiscoveryCandidate.create({
        data: {
          jobId: job.id,
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          status: "SKIPPED",
          skipReason: "already_known",
        },
      });
      skipped += 1;
      continue;
    }

    const existing = await args.db.ingestDiscoveryCandidate.findFirst({ where: { jobId: job.id, url: result.url }, select: { id: true } });
    if (existing) continue;

    await args.db.ingestDiscoveryCandidate.create({
      data: {
        jobId: job.id,
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        status: "PENDING",
      },
    });
    queued += 1;
  }

  await args.db.ingestDiscoveryJob.update({
    where: { id: job.id },
    data: { status: "DONE", resultsCount: queued + skipped, updatedAt: new Date() },
  });

  return { found: results.length, queued, skipped };
}
