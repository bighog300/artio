import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/auth";
import { getCronStatusSnapshot } from "@/lib/cron-state";
import { db } from "@/lib/db";
import LogsClient from "./logs-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminIngestLogsPage() {
  await requireAdmin();

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [cronState, recentRunFailures, recentCandidateRejections] = await Promise.all([
    getCronStatusSnapshot().catch(() => ({})),
    db.ingestRun.findMany({
      where: { status: "FAILED", createdAt: { gte: since7d } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        status: true,
        sourceUrl: true,
        errorCode: true,
        errorMessage: true,
        errorDetail: true,
        durationMs: true,
        venue: { select: { id: true, name: true } },
      },
    }),
    db.ingestExtractedEvent.findMany({
      where: { status: "REJECTED", createdAt: { gte: since7d } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        status: true,
        confidenceScore: true,
        confidenceBand: true,
        rejectionReason: true,
        venue: { select: { id: true, name: true } },
        run: { select: { id: true } },
      },
    }),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Ingest Logs"
        description="Cron run outcomes, extraction failures, and candidate rejections for the last 7 days."
      />
      <LogsClient
        cronState={cronState}
        initialRunFailures={recentRunFailures.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))}
        initialCandidateRejections={recentCandidateRejections.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
