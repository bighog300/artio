import Link from "next/link";
import { headers } from "next/headers";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestTriggerClient from "@/app/(admin)/admin/ingest/_components/ingest-trigger-client";

export const dynamic = "force-dynamic";

type IngestRun = {
  id: string;
  createdAt: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  sourceUrl: string;
  fetchStatus: string | null;
  errorCode: string | null;
  createdCount: number | null;
  venue: { id: string; name: string };
};

type VenueListResponse = {
  items: Array<{ id: string; name: string; websiteUrl: string | null }>;
};

async function fetchAdminJson<T>(path: string): Promise<T | null> {
  const baseUrl = await getServerBaseUrl();
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const res = await fetch(`${baseUrl}${path}`, { cache: "no-store", headers: cookie ? { cookie } : undefined });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export default async function AdminIngestPage() {
  const [runsResponse, venuesResponse] = await Promise.all([
    fetchAdminJson<{ ok: boolean; runs: IngestRun[] }>("/api/admin/ingest/runs?take=20"),
    fetchAdminJson<VenueListResponse>("/api/admin/venues"),
  ]);

  const runs = runsResponse?.runs ?? [];
  const venues = (venuesResponse?.items ?? [])
    .filter((venue) => Boolean(venue.websiteUrl))
    .map((venue) => ({ id: venue.id, name: venue.name, websiteUrl: venue.websiteUrl as string }));

  return (
    <main className="space-y-4">
      <AdminPageHeader
        title="Ingest"
        description="Run venue extraction and moderate extracted event candidates."
      />

      <div className="flex items-center justify-between">
        <IngestTriggerClient venues={venues} />
        <Link href="/admin/ingest/health" className="text-sm underline">View Ingest Health</Link>
      </div>

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Recent Runs</h2>
          <p className="text-sm text-muted-foreground">Latest 20 ingest runs across venues.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-3 py-2">Created At</th>
                <th className="px-3 py-2">Venue Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source URL</th>
                <th className="px-3 py-2">Created Count</th>
                <th className="px-3 py-2">Error Code</th>
                <th className="px-3 py-2">View</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b align-top">
                  <td className="px-3 py-2">{new Date(run.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{run.venue.name}</td>
                  <td className="px-3 py-2"><IngestStatusBadge status={run.status} /></td>
                  <td className="px-3 py-2 break-all text-xs text-muted-foreground">{run.sourceUrl}</td>
                  <td className="px-3 py-2">{run.createdCount ?? "—"}</td>
                  <td className="px-3 py-2">{run.status === "FAILED" ? run.errorCode ?? "FAILED" : "—"}</td>
                  <td className="px-3 py-2"><Link className="underline" href={`/admin/ingest/runs/${run.id}`}>Open</Link></td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={7}>No ingest runs found yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
