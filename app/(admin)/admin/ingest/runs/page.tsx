import Link from "next/link";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestTriggerClient from "@/app/(admin)/admin/ingest/_components/ingest-trigger-client";
import LogsClient from "@/app/(admin)/admin/ingest/logs/logs-client";
import HealthContent from "@/app/(admin)/admin/ingest/health/health-content";
import { SchedulePanel } from "./schedule-panel";
import { RunsFilters } from "./runs-filters";
import { db } from "@/lib/db";
import { getIngestLogsData } from "@/app/(admin)/admin/ingest/logs/logs-data";
import { getAdminIngestHealthData } from "@/lib/ingest/health-query";
import type { IngestStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const VALID_STATUSES: IngestStatus[] = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"];

export default async function AdminIngestRunsPage({
  searchParams,
}: {
  searchParams: Promise<{
    venueId?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const venueId = params.venueId ?? null;
  const status = params.status ?? null;
  const statusFilter: IngestStatus | null = status && VALID_STATUSES.includes(status as IngestStatus)
    ? (status as IngestStatus)
    : null;

  const where: Prisma.IngestRunWhereInput = {
    ...(venueId ? { venueId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [runs, totalRuns, venues, logsData, healthData] = await Promise.all([
    db.ingestRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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
    db.ingestRun.count({ where }),
    db.venue.findMany({
      where: { websiteUrl: { not: null }, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, websiteUrl: true, ingestFrequency: true },
      take: 200,
    }),
    getIngestLogsData(),
    getAdminIngestHealthData(db),
  ]);

  const venueOptions = venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    websiteUrl: venue.websiteUrl ?? "",
    ingestFrequency: venue.ingestFrequency,
  }));
  const validVenueIds = new Set(venueOptions.map((venue) => venue.id));
  const currentVenueId = venueId && validVenueIds.has(venueId) ? venueId : null;
  const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Pipeline ops"
        description="Trigger runs, view run history, logs, and pipeline health."
      />
      <RunsFilters
        venues={venueOptions.map((venue) => ({ id: venue.id, name: venue.name }))}
        currentVenueId={currentVenueId}
        currentStatus={statusFilter}
        currentPage={page}
        totalPages={totalPages}
        totalRuns={totalRuns}
      />

      {/* Trigger a manual extraction run */}
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

      <section className="space-y-4 border-t pt-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Extraction logs
        </h2>
        <LogsClient {...logsData} />
      </section>

      <section className="space-y-4 border-t pt-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Pipeline health
        </h2>
        <HealthContent data={healthData} />
      </section>
    </>
  );
}
