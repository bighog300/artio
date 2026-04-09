import Link from "next/link";
import type { AdminAuditLog } from "@prisma/client";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatDate, formatRelativeTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  SETTINGS_UPDATED: "Settings updated",
  SETTINGS_SYNCED_FROM_ENV: "Synced from environment",
  SETTINGS_IMPORTED: "Imported from file",
  SETTINGS_EXPORTED: "Exported",
};

export default async function SettingsLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin({ redirectOnFail: true });
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where = { targetType: "site_settings" };
  const [items, total] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.adminAuditLog.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader
        title="Settings change log"
        description="All changes to platform settings, imports, exports, and env syncs."
        backHref="/admin/settings?tab=configuration"
        backLabel="Back to settings"
      />
      <p className="text-sm text-muted-foreground">{total} entries</p>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                  No settings changes recorded yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span title={formatDate(item.createdAt)} suppressHydrationWarning>
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.actorEmail}</td>
                  <td className="px-3 py-2 font-medium">
                    {ACTION_LABELS[item.action] ?? item.action}
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <ChangeDetail item={item} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <div className="space-x-3">
          {page > 1 ? (
            <Link className="underline" href={`/admin/settings/log?page=${page - 1}`}>
              Previous
            </Link>
          ) : (
            <span className="text-muted-foreground">Previous</span>
          )}
          {page < totalPages ? (
            <Link className="underline" href={`/admin/settings/log?page=${page + 1}`}>
              Next
            </Link>
          ) : (
            <span className="text-muted-foreground">Next</span>
          )}
        </div>
      </div>
    </main>
  );
}

function ChangeDetail({ item }: { item: AdminAuditLog }) {
  const meta = item.metadata as Record<string, unknown> | null;
  if (!meta) return <span className="text-muted-foreground">—</span>;

  if (item.action === "SETTINGS_UPDATED") {
    const changes = meta.changes as
      | Record<string, { from: unknown; to: unknown }>
      | undefined;
    if (!changes || Object.keys(changes).length === 0)
      return <span className="text-muted-foreground">No fields changed</span>;

    const entries = Object.entries(changes);
    const rows = entries.map(([field, { from, to }]) => (
      <li key={field} className="font-mono">
        <span className="text-muted-foreground">{field}</span>{" "}
        <span className="text-muted-foreground">{String(from ?? "null")}</span>
        {" → "}
        <span>{String(to ?? "null")}</span>
      </li>
    ));

    if (entries.length <= 3) return <ul className="space-y-0.5 text-xs">{rows}</ul>;

    return (
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {entries.length} fields changed
        </summary>
        <ul className="mt-1 space-y-0.5 text-xs">{rows}</ul>
      </details>
    );
  }

  if (item.action === "SETTINGS_SYNCED_FROM_ENV") {
    const synced = (meta.synced as string[]) ?? [];
    const notFound = (meta.notFound as string[]) ?? [];
    return (
      <div className="space-y-0.5 text-xs">
        <p>Synced: {synced.length > 0 ? synced.join(", ") : "none"}</p>
        {notFound.length > 0 && (
          <p className="text-muted-foreground">Not in env: {notFound.join(", ")}</p>
        )}
      </div>
    );
  }

  if (item.action === "SETTINGS_IMPORTED") {
    const fields = (meta.fields as string[]) ?? [];
    const applied = (meta.fieldsApplied as number) ?? fields.length;
    return (
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {applied} field{applied === 1 ? "" : "s"} applied
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">{fields.join(", ")}</p>
      </details>
    );
  }

  if (item.action === "SETTINGS_EXPORTED") {
    return <span className="text-xs text-muted-foreground">Snapshot downloaded</span>;
  }

  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">View metadata</summary>
      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify(meta, null, 2)}
      </pre>
    </details>
  );
}
