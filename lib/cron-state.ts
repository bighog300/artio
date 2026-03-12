import { db } from "@/lib/db";

export type CronRunRecord = {
  cronName: string;
  cronRunId: string;
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
};

export type CronRuntimeState = {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorSummary?: string;
};

export const MONITORED_CRONS = [
  "outbox_send",
  "digests_weekly",
  "retention_engagement",
  "ingest_regions",
  "ingest_venues",
  "ingest_discovery",
] as const;

const CRON_STATE_PREFIX = "ops:cron_state:";

type MarkerPayload = {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorSummary?: string;
};

function markerName(cronName: string) {
  return `${CRON_STATE_PREFIX}${cronName}`;
}

async function upsertMarker(name: string, paramsJson: MarkerPayload) {
  const existing = await db.perfSnapshot.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (existing) {
    await db.perfSnapshot.update({ where: { id: existing.id }, data: { paramsJson, explainText: "ops_cron_state" } });
    return;
  }
  await db.perfSnapshot.create({ data: { name, paramsJson, explainText: "ops_cron_state" } });
}

export async function recordCronRun({ cronName, status, finishedAt, errorMessage }: CronRunRecord) {
  const name = markerName(cronName);
  const existing = await db.perfSnapshot.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { paramsJson: true } });
  const prev = (existing?.paramsJson ?? {}) as MarkerPayload;
  const next: MarkerPayload = {
    ...prev,
    ...(status === "success"
      ? { lastSuccessAt: finishedAt }
      : { lastErrorAt: finishedAt, lastErrorSummary: (errorMessage ?? "error").slice(0, 200) }),
  };
  await upsertMarker(name, next);
}

export async function getCronStatusSnapshot(): Promise<Record<(typeof MONITORED_CRONS)[number], CronRuntimeState>> {
  const rows = await db.perfSnapshot.findMany({
    where: { name: { in: MONITORED_CRONS.map((cronName) => markerName(cronName)) } },
    select: { name: true, paramsJson: true },
  });

  const byName = new Map<string, MarkerPayload>();
  for (const row of rows) {
    byName.set(row.name, (row.paramsJson ?? {}) as MarkerPayload);
  }

  return {
    outbox_send: byName.get(markerName("outbox_send")) ?? {},
    digests_weekly: byName.get(markerName("digests_weekly")) ?? {},
    retention_engagement: byName.get(markerName("retention_engagement")) ?? {},
    ingest_regions: byName.get(markerName("ingest_regions")) ?? {},
    ingest_venues: byName.get(markerName("ingest_venues")) ?? {},
    ingest_discovery: byName.get(markerName("ingest_discovery")) ?? {},
  };
}
