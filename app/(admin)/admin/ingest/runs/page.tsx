import Link from "next/link";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestTriggerClient from "@/app/(admin)/admin/ingest/_components/ingest-trigger-client";
import { SchedulePanel } from "./schedule-panel";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type IngestRun = {
  id: string;
  createdAt: Date;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  sourceUrl: string;
  fetchStatus: number | null;
  errorCode: string | null;
  createdCandidates: number;
  venue: { id: string; name: string };
};

export default async function AdminIngestRunsPage() {
  const [runs, venues] = await Promise.all([
    db.ingestRun.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        createdAt: true,
        status: true,
        sourceUrl: true,
        fetchStatus: true,
        errorCode: true,
        createdCandidates: true,
        venue: { select: { id: true, name: true } },
      },
    }),
    db.venue.findMany({
      where: { websiteUrl: { not: null }, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, websiteUrl: true, ingestFrequency: true },
      take: 200,
    }),
  ]);

  const venueOptions = venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    websiteUrl: venue.websiteUrl ?? "",
    ingestFrequency: venue.ingestFrequency,
  }));

  return (
    <>
      <AdminPageHeader
        title="Ingest Runs"
        description="Trigger a manual extraction run or review recent run history."
      />

      <IngestTriggerClient venues={venueOptions} />
      <SchedulePanel
        venues={venueOptions.map((v) => ({
          id: v.id,
          name: v.name,
          ingestFrequency: (v as { ingestFrequency?: string }).ingestFrequency as
            | "DAILY"
            | "WEEKLY"
            | "MONTHLY"
            | "MANUAL" ?? "WEEKLY",
        }))}
      />

      <section className="rounded-lg border bg-background p-4">
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
                  <td className="px-3 py-2">{run.createdCandidates ?? "—"}</td>
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
    </>
  );
}
