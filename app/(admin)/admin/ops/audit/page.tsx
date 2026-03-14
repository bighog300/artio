import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function asSingle(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function toPage(input: string): number {
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin({ redirectOnFail: true });
  const params = await searchParams;

  const actorEmail = asSingle(params.actorEmail).trim();
  const action = asSingle(params.action).trim();
  const targetType = asSingle(params.targetType).trim();
  const page = toPage(asSingle(params.page));

  const where = {
    ...(actorEmail ? { actorEmail: { contains: actorEmail, mode: "insensitive" as const } } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(targetType ? { targetType } : {}),
  };

  const [items, totalCount] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.adminAuditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hrefForPage = (nextPage: number) => {
    const query = new URLSearchParams();
    if (actorEmail) query.set("actorEmail", actorEmail);
    if (action) query.set("action", action);
    if (targetType) query.set("targetType", targetType);
    query.set("page", String(nextPage));
    return `/admin/ops/audit?${query.toString()}`;
  };

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Audit Log</h1>
        <p className="text-sm text-muted-foreground">Review and filter admin operations.</p>
      </div>

      <form method="GET" className="grid gap-2 rounded border bg-background p-3 md:grid-cols-4">
        <input name="actorEmail" defaultValue={actorEmail} placeholder="Actor email" className="rounded border px-2 py-1 text-sm" />
        <input name="action" defaultValue={action} placeholder="Action contains" className="rounded border px-2 py-1 text-sm" />
        <input name="targetType" defaultValue={targetType} placeholder="Target type" className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-3 py-1 text-sm">Apply filters</button>
      </form>

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target Type</th>
              <th className="px-3 py-2">Target ID</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted-foreground" colSpan={6}>No audit entries found.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.createdAt.toISOString()}</td>
                  <td className="px-3 py-2">{item.actorEmail}</td>
                  <td className="px-3 py-2">{item.action}</td>
                  <td className="px-3 py-2">{item.targetType}</td>
                  <td className="px-3 py-2">{item.targetId ?? "—"}</td>
                  <td className="px-3 py-2 max-w-xs">
                    {item.metadata ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">View</summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>Page {page} of {totalPages} ({totalCount} total)</span>
        <div className="space-x-3">
          {page > 1 ? <Link className="underline" href={hrefForPage(page - 1)}>Previous</Link> : <span className="text-muted-foreground">Previous</span>}
          {page < totalPages ? <Link className="underline" href={hrefForPage(page + 1)}>Next</Link> : <span className="text-muted-foreground">Next</span>}
        </div>
      </div>
    </main>
  );
}
