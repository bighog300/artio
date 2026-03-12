import { db } from "@/lib/db";
import { sendAlert } from "@/lib/alerts";
import { getCronStatusSnapshot, recordCronRun, type CronRunRecord } from "@/lib/cron-state";
import { PERSONALIZATION_EXPOSURE_SAMPLE_RATE_PROD, PERSONALIZATION_VERSION, PERSONALIZATION_VERSION_LEGACY } from "@/lib/personalization/tuning";

const CRON_STALL_THRESHOLD_MS = 36 * 60 * 60 * 1000;
const OUTBOX_BACKLOG_WARN_THRESHOLD = 200;
const ALERT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
const WATCHDOG_ALERT_PREFIX = "ops:watchdog_alert:";

type WatchdogMode = "snapshot" | "alert";

async function safeCronSnapshot() {
  if (!process.env.DATABASE_URL) {
    return {
      outbox_send: {},
      digests_weekly: {},
      retention_engagement: {},
      ingest_regions: {},
      ingest_venues: {},
      ingest_discovery: {},
    };
  }
  try {
    return await getCronStatusSnapshot();
  } catch {
    return {
      outbox_send: {},
      digests_weekly: {},
      retention_engagement: {},
      ingest_regions: {},
      ingest_venues: {},
      ingest_discovery: {},
    };
  }
}

export async function markCronSuccess(cronName: string, timestampIso = new Date().toISOString(), cronRunId = "unknown") {
  if (!process.env.DATABASE_URL) return;
  const record: CronRunRecord = {
    cronName,
    cronRunId,
    status: "success",
    startedAt: timestampIso,
    finishedAt: timestampIso,
  };
  await recordCronRun(record).catch(() => undefined);
}

export async function markCronFailure(cronName: string, summary: string, timestampIso = new Date().toISOString(), cronRunId = "unknown") {
  if (!process.env.DATABASE_URL) return;
  const record: CronRunRecord = {
    cronName,
    cronRunId,
    status: "error",
    startedAt: timestampIso,
    finishedAt: timestampIso,
    errorMessage: summary,
  };
  await recordCronRun(record).catch(() => undefined);
}

async function safeOutboxPendingCount() {
  if (!process.env.DATABASE_URL) return "unknown" as const;
  try {
    return await db.notificationOutbox.count({ where: { status: "PENDING", errorMessage: null } });
  } catch {
    return "unknown" as const;
  }
}

async function shouldSendDedupedAlert(alertKey: string) {
  if (!process.env.DATABASE_URL) return true;
  const name = `${WATCHDOG_ALERT_PREFIX}${alertKey}`;
  const now = new Date();
  const existing = await db.perfSnapshot.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { id: true, paramsJson: true } });
  const lastAlertAtIso = typeof (existing?.paramsJson as { lastAlertAt?: unknown } | undefined)?.lastAlertAt === "string"
    ? (existing?.paramsJson as { lastAlertAt: string }).lastAlertAt
    : null;
  if (lastAlertAtIso) {
    const age = now.getTime() - new Date(lastAlertAtIso).getTime();
    if (age < ALERT_DEDUPE_WINDOW_MS) return false;
  }

  const paramsJson = { lastAlertAt: now.toISOString(), alertKey };
  if (existing) {
    await db.perfSnapshot.update({ where: { id: existing.id }, data: { paramsJson, explainText: "ops_watchdog_alert" } });
  } else {
    await db.perfSnapshot.create({ data: { name, paramsJson, explainText: "ops_watchdog_alert" } });
  }
  return true;
}

export async function runOpsWatchdog({ mode = "snapshot" }: { mode?: WatchdogMode } = {}) {
  const cron = await safeCronSnapshot();
  const nowMs = Date.now();

  for (const [cronName, state] of Object.entries(cron)) {
    if (mode !== "alert") continue;
    if (!state.lastSuccessAt) continue;
    const ageMs = nowMs - new Date(state.lastSuccessAt).getTime();
    if (ageMs > CRON_STALL_THRESHOLD_MS) {
      const alertKey = `cron_stalled:${cronName}`;
      const shouldAlert = await shouldSendDedupedAlert(alertKey).catch(() => false);
      if (!shouldAlert) continue;
      await sendAlert({
        severity: "error",
        title: "Cron stalled",
        body: `${cronName} has not completed successfully in ${Math.floor(ageMs / 3_600_000)}h`,
        tags: { cronName, ageMs, thresholdMs: CRON_STALL_THRESHOLD_MS },
      });
    }
  }

  const backlog = await safeOutboxPendingCount();
  if (mode === "alert" && typeof backlog === "number" && backlog > OUTBOX_BACKLOG_WARN_THRESHOLD) {
    const shouldAlert = await shouldSendDedupedAlert("outbox_backlog_high").catch(() => false);
    if (!shouldAlert) {
      return { cron, backlog, stallThresholdHours: CRON_STALL_THRESHOLD_MS / 3_600_000 };
    }
    await sendAlert({
      severity: "warn",
      title: "Outbox backlog high",
      body: `Pending outbox notifications: ${backlog}`,
      tags: { backlog, threshold: OUTBOX_BACKLOG_WARN_THRESHOLD },
    });
  }

  return { cron, backlog, stallThresholdHours: CRON_STALL_THRESHOLD_MS / 3_600_000 };
}

export async function getOpsMetricsSnapshot() {
  return {
    build: {
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_SHA ?? "unknown",
      buildTimeISO: process.env.VERCEL_GIT_COMMIT_TIMESTAMP ?? process.env.BUILD_TIME_ISO ?? "unknown",
    },
    cron: await safeCronSnapshot(),
    outbox: {
      pendingCount: await safeOutboxPendingCount(),
      backlogWarnThreshold: OUTBOX_BACKLOG_WARN_THRESHOLD,
    },
    personalization: {
      version: PERSONALIZATION_VERSION,
      rankingVersion: process.env.NEXT_PUBLIC_PERSONALIZATION_VERSION === "v2" ? "v2" : "v3",
      rankingVersionLegacy: PERSONALIZATION_VERSION_LEGACY,
      exposureSampleRateProd: PERSONALIZATION_EXPOSURE_SAMPLE_RATE_PROD,
    },
  };
}
