import test from "node:test";
import assert from "node:assert/strict";
import { computeNextFireAt, runSchedulerTick } from "../lib/cron-scheduler/engine";

function createDb({
  jobs = [],
  lockParams = null as any,
  count = jobs.length,
} = {}) {
  const updates: any[] = [];
  const snapshots = new Map<string, any>();
  if (lockParams) snapshots.set("cron:tick:lock", { id: "lock-1", name: "cron:tick:lock", paramsJson: lockParams });

  const db = {
    cronJob: {
      count: async () => count,
      findMany: async ({ where }: any) => jobs.filter((job: any) => where.enabled === job.enabled && (!job.nextFireAt || job.nextFireAt <= where.OR[0].nextFireAt.lte)),
      update: async ({ where, data }: any) => {
        updates.push({ where, data });
        const idx = jobs.findIndex((j: any) => j.id === where.id || j.name === where.name);
        if (idx >= 0) jobs[idx] = { ...jobs[idx], ...data };
        return jobs[idx];
      },
      upsert: async () => ({}),
      createMany: async ({ data }: any) => {
        jobs.push(...data.map((x: any, i: number) => ({ id: `seed-${i}`, ...x })));
      },
    },
    perfSnapshot: {
      findFirst: async ({ where }: any) => snapshots.get(where.name) ?? null,
      upsert: async () => ({}),
      create: async ({ data }: any) => {
        const row = { id: `${data.name}-id`, ...data };
        snapshots.set(data.name, row);
        return { id: row.id };
      },
      update: async ({ where, data }: any) => {
        const existing = [...snapshots.values()].find((x) => x.id === where.id);
        if (existing) Object.assign(existing, data);
        return existing;
      },
      delete: async ({ where }: any) => {
        for (const [k, v] of snapshots.entries()) {
          if (v.id === where.id) snapshots.delete(k);
        }
      },
    },
  } as any;

  return { db, updates, jobs, snapshots };
}

test("computeNextFireAt returns future Date for valid cron", () => {
  const next = computeNextFireAt("*/5 * * * *", new Date());
  assert.equal(next instanceof Date, true);
  assert.equal((next?.getTime() ?? 0) > Date.now(), true);
});

test("computeNextFireAt returns null for invalid cron", () => {
  assert.equal(computeNextFireAt("not-a-cron", new Date()), null);
});

test("runSchedulerTick fires due jobs", async () => {
  const due = { id: "1", name: "outbox_send", displayName: "Outbox", endpoint: "/api/cron/outbox/send", schedule: "*/5 * * * *", enabled: true, nextFireAt: new Date(Date.now() - 1000) };
  const state = createDb({ jobs: [due] as any[] });
  (globalThis as any).fetch = async () => new Response("ok", { status: 200 });
  const result = await runSchedulerTick({ db: state.db, appBaseUrl: "http://localhost:3000", cronSecret: "secret" });
  assert.deepEqual(result.fired, ["outbox_send"]);
});

test("runSchedulerTick skips future jobs", async () => {
  const future = { id: "1", name: "outbox_send", displayName: "Outbox", endpoint: "/api/cron/outbox/send", schedule: "*/5 * * * *", enabled: true, nextFireAt: new Date(Date.now() + 60_000) };
  const state = createDb({ jobs: [future] as any[] });
  (globalThis as any).fetch = async () => new Response("ok", { status: 200 });
  const result = await runSchedulerTick({ db: state.db, appBaseUrl: "http://localhost:3000", cronSecret: "secret" });
  assert.deepEqual(result.fired, []);
});

test("runSchedulerTick records error status on 500", async () => {
  const due = { id: "1", name: "outbox_send", displayName: "Outbox", endpoint: "/api/cron/outbox/send", schedule: "*/5 * * * *", enabled: true, nextFireAt: new Date(Date.now() - 1000) };
  const state = createDb({ jobs: [due] as any[] });
  (globalThis as any).fetch = async () => new Response("fail", { status: 500 });
  const result = await runSchedulerTick({ db: state.db, appBaseUrl: "http://localhost:3000", cronSecret: "secret" });
  assert.deepEqual(result.errors, ["outbox_send"]);
});

test("runSchedulerTick returns locked skip for recent lock", async () => {
  const state = createDb({ lockParams: { lockedAt: new Date().toISOString() } });
  const result = await runSchedulerTick({ db: state.db, appBaseUrl: "http://localhost:3000", cronSecret: "secret" });
  assert.deepEqual(result, { fired: [], skipped: ["locked"], errors: [] });
});

test("runSchedulerTick seeds defaults when empty", async () => {
  const state = createDb({ jobs: [], count: 0 });
  (globalThis as any).fetch = async () => new Response("ok", { status: 200 });
  await runSchedulerTick({ db: state.db, appBaseUrl: "http://localhost:3000", cronSecret: "secret" });
  assert.equal(state.jobs.length >= 8, true);
});
