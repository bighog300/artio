import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import { CronTriggerButtons } from "./cron-trigger-buttons";

async function fetchJson(path: string, token?: string) {
  const res = await fetch(path, { cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) return null;
  return res.json();
}

export default async function AdminOpsPage() {
  await requireAdmin({ redirectOnFail: true });
  const baseUrl = await getServerBaseUrl();
  const health = await fetchJson(`${baseUrl}/api/health`);
  const ops = process.env.OPS_SECRET
    ? await fetchJson(`${baseUrl}/api/ops/metrics`, process.env.OPS_SECRET)
    : null;

  const degraded = !health?.ok;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Ops Dashboard</h1>
      <p>Status: {degraded ? "Degraded" : "OK"}</p>
      <section>
        <h2 className="font-medium">Health</h2>
        <pre className="text-xs bg-muted p-3 rounded">{JSON.stringify(health, null, 2)}</pre>
      </section>
      <section>
        <h2 className="font-medium">Ops Metrics</h2>
        <pre className="text-xs bg-muted p-3 rounded">{JSON.stringify(ops ?? { note: "OPS_SECRET not configured or endpoint unauthorized" }, null, 2)}</pre>
      </section>
      <section className="space-x-3">
        <Link href="/admin/ops/jobs" className="underline">Open Jobs Panel</Link>
        <Link href="/admin/ops/audit" className="underline">View Admin Audit Log</Link>
        <CronTriggerButtons />
        <Link href="/admin/ops/email" className="underline">Open Outbox Monitoring</Link>
        <p className="text-xs text-muted-foreground">
          Dry runs use the Jobs panel for authenticated triggering.
          {" "}These buttons call the cron endpoint directly and require
          {" "}CRON_SECRET to be configured.
        </p>
      </section>
    </main>
  );
}
