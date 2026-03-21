import { db } from "@/lib/db";

type IngestDb = Pick<typeof db, "ingestRun" | "ingestExtractedEvent">;

export async function getAdminIngestHealthData(dbClient: IngestDb) {
  const now = Date.now();
  const last7DaysStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const last24HoursStart = new Date(now - 24 * 60 * 60 * 1000);

  const [last7Runs, last24hRuns, breakerWindowRuns, venueRuns7d, venueCandidates7d] = await Promise.all([
    dbClient.ingestRun.findMany({
      where: { createdAt: { gte: last7DaysStart } },
      select: {
        status: true,
        errorCode: true,
        createdCandidates: true,
        durationMs: true,
      },
    }),
    dbClient.ingestRun.findMany({
      where: { createdAt: { gte: last24HoursStart } },
      select: {
        id: true,
        createdAt: true,
        venueId: true,
        status: true,
        createdCandidates: true,
        dedupedCandidates: true,
        errorCode: true,
        venue: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    dbClient.ingestRun.findMany({
      where: { createdAt: { gte: new Date(now - Number.parseInt(process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS ?? "6", 10) * 60 * 60 * 1000) } },
      select: { status: true },
    }),
    dbClient.ingestRun.findMany({
      where: {
        createdAt: { gte: last7DaysStart },
        status: "SUCCEEDED",
      },
      select: {
        venueId: true,
        createdCandidates: true,
        venue: { select: { id: true, name: true } },
      },
    }),
    dbClient.ingestExtractedEvent.findMany({
      where: {
        createdAt: { gte: last7DaysStart },
        duplicateOfId: null,
      },
      select: {
        venueId: true,
        confidenceBand: true,
        status: true,
      },
    }),
  ]);

  const succeeded = last7Runs.filter((run) => run.status === "SUCCEEDED").length;
  const failed = last7Runs.filter((run) => run.status === "FAILED").length;
  const totalRuns = last7Runs.length;
  const successRate = totalRuns > 0 ? succeeded / totalRuns : 0;
  const avgCreatedCandidates = totalRuns > 0
    ? last7Runs.reduce((sum, run) => sum + run.createdCandidates, 0) / totalRuns
    : 0;
  const durationRows = last7Runs.filter((run) => typeof run.durationMs === "number");
  const avgDurationMs = durationRows.length > 0
    ? durationRows.reduce((sum, run) => sum + (run.durationMs ?? 0), 0) / durationRows.length
    : 0;

  const topErrorCodes = Object.entries(
    last7Runs.reduce<Record<string, number>>((acc, run) => {
      if (!run.errorCode) return acc;
      acc[run.errorCode] = (acc[run.errorCode] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([errorCode, count]) => ({ errorCode, count }));

  const cbMinRuns = Number.parseInt(process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS ?? "5", 10);
  const cbFailRateThreshold = Number.parseFloat(process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE ?? "0.6");
  const cbSucceeded = breakerWindowRuns.filter((run) => run.status === "SUCCEEDED").length;
  const cbFailed = breakerWindowRuns.filter((run) => run.status === "FAILED").length;
  const cbRunCount = cbSucceeded + cbFailed;
  const cbFailRate = cbRunCount > 0 ? cbFailed / cbRunCount : 0;

  const venueRunMap = new Map<string, { name: string; runCount: number; totalCreated: number }>();
  for (const run of venueRuns7d) {
    const existing = venueRunMap.get(run.venueId);
    if (existing) {
      existing.runCount += 1;
      existing.totalCreated += run.createdCandidates;
    } else {
      venueRunMap.set(run.venueId, {
        name: run.venue?.name ?? run.venueId,
        runCount: 1,
        totalCreated: run.createdCandidates,
      });
    }
  }

  const venueCandidateMap = new Map<string, {
    high: number;
    medium: number;
    low: number;
    approved: number;
    rejected: number;
    pending: number;
  }>();
  for (const c of venueCandidates7d) {
    const existing = venueCandidateMap.get(c.venueId) ?? {
      high: 0,
      medium: 0,
      low: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
    };
    if (c.confidenceBand === "HIGH") existing.high += 1;
    else if (c.confidenceBand === "MEDIUM") existing.medium += 1;
    else existing.low += 1;
    if (c.status === "APPROVED") existing.approved += 1;
    else if (c.status === "REJECTED") existing.rejected += 1;
    else existing.pending += 1;
    venueCandidateMap.set(c.venueId, existing);
  }

  const venuePerformance = Array.from(venueRunMap.entries())
    .map(([venueId, runData]) => {
      const candidates = venueCandidateMap.get(venueId) ?? {
        high: 0,
        medium: 0,
        low: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      };
      const total = candidates.high + candidates.medium + candidates.low;
      const avgPerRun = runData.runCount > 0
        ? runData.totalCreated / runData.runCount
        : 0;
      const highFraction = total > 0 ? candidates.high / total : 0;
      const approvalRate = (candidates.approved + candidates.rejected) > 0
        ? candidates.approved / (candidates.approved + candidates.rejected)
        : null;

      const qualitySignal: "good" | "low" | "noise" = avgPerRun === 0
        ? "low"
        : highFraction < 0.2 && total > 3
        ? "noise"
        : "good";

      return {
        venueId,
        name: runData.name,
        runCount: runData.runCount,
        avgPerRun: Math.round(avgPerRun * 10) / 10,
        total,
        high: candidates.high,
        medium: candidates.medium,
        low: candidates.low,
        approved: candidates.approved,
        rejected: candidates.rejected,
        pending: candidates.pending,
        approvalRate,
        qualitySignal,
      };
    })
    .sort((a, b) => {
      const qOrder = { noise: 0, low: 1, good: 2 };
      if (qOrder[a.qualitySignal] !== qOrder[b.qualitySignal]) {
        return qOrder[a.qualitySignal] - qOrder[b.qualitySignal];
      }
      return b.avgPerRun - a.avgPerRun;
    });

  return {
    ok: true as const,
    last7Days: {
      totalRuns,
      succeeded,
      failed,
      successRate,
      avgCreatedCandidates,
      avgDurationMs,
      topErrorCodes,
    },
    last24hRuns: last24hRuns.map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      venueId: run.venueId,
      venueName: run.venue?.name ?? null,
      status: run.status,
      createdCandidates: run.createdCandidates,
      dedupedCandidates: run.dedupedCandidates,
      errorCode: run.errorCode,
    })),
    failures24h: last24hRuns
      .filter((run) => run.status === "FAILED")
      .map((run) => ({ id: run.id, createdAt: run.createdAt, errorCode: run.errorCode })),
    circuitBreaker: {
      open: cbRunCount >= cbMinRuns && cbFailRate >= cbFailRateThreshold,
      failRate: cbFailRate,
      runCount: cbRunCount,
    },
    venuePerformance,
  };
}
