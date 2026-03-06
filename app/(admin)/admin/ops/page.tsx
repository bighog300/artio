import Link from "next/link";
import { getServerBaseUrl } from "@/lib/server/get-base-url";

async function fetchJson(path: string, token?: string) {
  const res = await fetch(path, { cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) return null;
  return res.json();
}

export default async function AdminOpsPage() {
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
        <Link href="/api/cron/outbox/send?dryRun=1" className="underline">Run Outbox Dry Run</Link>
        <Link href="/admin/ops/email" className="underline">Open Outbox Monitoring</Link>
        <Link href="/api/cron/digests/weekly?dryRun=1" className="underline">Run Digest Dry Run</Link>
      </section>
    </main>
  );
}
