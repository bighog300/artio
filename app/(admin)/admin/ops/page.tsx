import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import AdminPageHeader from "../_components/AdminPageHeader";
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
      <AdminPageHeader title="Ops" description="System health and operational controls." />
      <h1 className="text-2xl font-semibold">Ops Dashboard</h1>
      <p>Status: {degraded ? "Degraded" : "OK"}</p>
      <section>
        <h2 className="font-medium">Health</h2>
        <div className="rounded-lg border bg-background p-4">
          <pre className="text-xs">{JSON.stringify(health, null, 2)}</pre>
        </div>
      </section>
      <section>
        <h2 className="font-medium">Ops Metrics</h2>
        <div className="rounded-lg border bg-background p-4">
          <pre className="text-xs">{JSON.stringify(ops ?? { note: "OPS_SECRET not configured or endpoint unauthorized" }, null, 2)}</pre>
        </div>
      </section>
      <section className="space-x-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/ops/jobs">Open Jobs Panel</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/ops/audit">View Admin Audit Log</Link>
        </Button>
        <CronTriggerButtons />
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/ops/email">Open Outbox Monitoring</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Dry runs use the Jobs panel for authenticated triggering.
          {" "}These buttons call the cron endpoint directly and require
          {" "}CRON_SECRET to be configured.
        </p>
      </section>
    </main>
  );
}
