import Link from "next/link";
import { db } from "@/lib/db";
import { OutboxActionsClient } from "./outbox-actions-client";

const HOUR_MS = 60 * 60 * 1000;

function redactEmail(email: string) {
  return `${email.slice(0, 3)}***`;
}

export default async function AdminOpsEmailPage() {
  const since = new Date(Date.now() - 24 * HOUR_MS);

  const [counts, failedRows] = await Promise.all([
    db.notificationOutbox.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.notificationOutbox.findMany({
      where: { status: "FAILED", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        toEmail: true,
        createdAt: true,
        attemptCount: true,
        errorMessage: true,
      },
    }),
  ]);

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Outbox monitoring</h1>
      <p className="text-sm text-muted-foreground">Window: last 24 hours</p>

      <section className="rounded border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Status counts</h2>
          <OutboxActionsClient />
        </div>
        <ul className="list-disc pl-5 text-sm">
          {counts.length === 0 ? <li>No rows in window.</li> : null}
          {counts.map((row) => (
            <li key={row.status}>
              {row.status}: {row._count._all}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border bg-background p-3 space-y-2">
        <h2 className="text-lg font-medium">Failed rows</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Error</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {failedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={6}>No failed rows in window.</td>
                </tr>
              ) : (
                failedRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.createdAt.toISOString()}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{redactEmail(row.toEmail)}</td>
                    <td className="px-3 py-2">{row.attemptCount}</td>
                    <td className="px-3 py-2">{row.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2"><OutboxActionsClient outboxId={row.id} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/admin/ops" className="underline text-sm">Back to Ops dashboard</Link>
    </main>
  );
}
