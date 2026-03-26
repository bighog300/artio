import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestRunCandidates from "@/app/(admin)/admin/ingest/_components/ingest-run-candidates";
import IngestVenueSnapshot from "@/app/(admin)/admin/ingest/_components/ingest-venue-snapshot";
import { InlineBanner } from "@/components/ui/inline-banner";
import { getAdminIngestRunDetail } from "@/lib/admin-ingest-route";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";


function normalizeOpeningHours(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.raw === "string") return obj.raw || null;
    if (typeof obj.text === "string") return obj.text || null;
    if (typeof obj.value === "string") return obj.value || null;
  }
  return null;
}

export default async function AdminIngestRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const detail = await getAdminIngestRunDetail(db, runId);

  if (!detail) notFound();

  const { run, counts } = detail;
  const runSnapshot = run.venueSnapshot && typeof run.venueSnapshot === "object" && !Array.isArray(run.venueSnapshot)
    ? run.venueSnapshot as {
      venueDescription?: string | null;
      venueCoverImageUrl?: string | null;
      venueOpeningHours?: string | null;
      venueContactEmail?: string | null;
      venueInstagramUrl?: string | null;
      venueFacebookUrl?: string | null;
    }
    : null;
  const venueDetails = run.venueSnapshot
    ? await db.venue.findUnique({
      where: { id: run.venue.id },
      select: {
        description: true,
        openingHours: true,
        contactEmail: true,
        instagramUrl: true,
        facebookUrl: true,
        featuredAssetId: true,
      },
    })
    : null;
  const venueDetailsForSnapshot = venueDetails
    ? {
      ...venueDetails,
      openingHours: normalizeOpeningHours(venueDetails.openingHours),
    }
    : null;

  const snapshotHasAnyData = Boolean(runSnapshot && Object.values(runSnapshot).some((value) => typeof value === "string" && value.trim().length > 0));
  const candidates: Parameters<typeof IngestRunCandidates>[0]["candidates"] = run.extractedEvents.map((candidate) => {
    const confidenceBand =
      candidate.confidenceBand === "HIGH" || candidate.confidenceBand === "MEDIUM" || candidate.confidenceBand === "LOW"
        ? candidate.confidenceBand
        : null;
    const confidenceReasons = Array.isArray(candidate.confidenceReasons)
      ? candidate.confidenceReasons.filter((reason): reason is string => typeof reason === "string")
      : null;
    return {
      ...candidate,
      startAt: candidate.startAt ? candidate.startAt.toISOString() : null,
      confidenceBand,
      confidenceReasons,
    };
  });

  return (
    <main className="space-y-4">
      <AdminPageHeader
        title="Ingest Run"
        description={`Review extracted candidates for ${run.venue.name}.`}
      />

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Run Metadata</h2>
          <Link href="/admin/ingest/runs" className="text-sm underline">Back to runs</Link>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-muted-foreground">Venue</dt><dd className="font-medium">{run.venue.name}</dd></div>
          <div><dt className="text-muted-foreground">Source URL</dt><dd className="break-all text-xs">{run.sourceUrl}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd><IngestStatusBadge status={run.status} /></dd></div>
          <div><dt className="text-muted-foreground">Started At</dt><dd>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Finished At</dt><dd>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Fetch Status</dt><dd>{run.fetchStatus ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Error Code</dt><dd>{run.errorCode ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Fetch Final URL</dt><dd className="break-all text-xs">{run.fetchFinalUrl ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Fetch Content-Type</dt><dd>{run.fetchContentType ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Fetch Bytes</dt><dd>{run.fetchBytes ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Error Message</dt><dd>{run.errorMessage ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Model</dt><dd>{run.model ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Tokens</dt><dd>{run.usageTotalTokens ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Candidates</dt><dd>{counts.total} total</dd></div>
          <div><dt className="text-muted-foreground">Primaries</dt><dd>{counts.primaries}</dd></div>
          <div><dt className="text-muted-foreground">Duplicates</dt><dd>{counts.duplicates}</dd></div>
          <div><dt className="text-muted-foreground">Pending</dt><dd>{counts.pending}</dd></div>
        </dl>
        {run.stopReason === "CANDIDATE_CAP_REACHED" ? (
          <div className="mt-4">
            <InlineBanner>
              Candidate cap reached — the source page returned more events than the per-run limit.
              Some events may not have been extracted. Consider increasing{" "}
              <code>AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN</code> or running again with a
              dedicated events page URL.
            </InlineBanner>
          </div>
        ) : null}
        {run.status === "FAILED" && run.errorDetail ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-muted-foreground">Error Detail</h3>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{run.errorDetail}</pre>
          </div>
        ) : null}
      </section>

      {runSnapshot && snapshotHasAnyData && venueDetailsForSnapshot ? (
        <section className="rounded-lg border bg-background p-4">
          <IngestVenueSnapshot
            runId={run.id}
            venueId={run.venue.id}
            snapshot={runSnapshot}
            venue={venueDetailsForSnapshot}
          />
        </section>
      ) : null}

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Extracted Candidates</h2>
          <p className="text-sm text-muted-foreground">Approve or reject pending candidates. Approval creates an unpublished event and submission.</p>
        </div>
        <IngestRunCandidates candidates={candidates} venueId={run.venue.id} runId={run.id} />
</section>
    </main>
  );
}
