import Link from "next/link";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";

type RunSummary = {
  id: string;
  status: string;
  createdAt: Date;
  createdCandidates: number;
  errorCode: string | null;
};

type VenuePipelineSummaryProps = {
  venueId: string;
  pendingEvents: number;
  approvedEvents: number;
  pendingArtists: number;
  pendingArtworks: number;
  pendingImages: number;
  recentRuns: RunSummary[];
};

export function VenuePipelineSummary({
  venueId,
  pendingEvents,
  approvedEvents,
  pendingArtists,
  pendingArtworks,
  pendingImages,
  recentRuns,
}: VenuePipelineSummaryProps) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Ingest pipeline</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PipelineStat label="Pending events" value={pendingEvents} href="/admin/ingest" />
        <PipelineStat label="Published events" value={approvedEvents} href={`/admin/events?venueId=${venueId}`} />
        <PipelineStat label="Artist candidates" value={pendingArtists} href="/admin/ingest/artists" />
        <PipelineStat label="Artwork candidates" value={pendingArtworks} href="/admin/ingest/artworks" />
      </div>

      {pendingImages > 0 ? (
        <p className="text-sm text-amber-700">
          {pendingImages} image candidate{pendingImages === 1 ? "" : "s"} pending —{" "}
          <Link href="/admin/ingest/venue-images" className="underline">
            review images →
          </Link>
        </p>
      ) : null}

      {recentRuns.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent extraction runs</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-4">Date</th>
                <th className="py-1.5 pr-4">Status</th>
                <th className="py-1.5 pr-4">Candidates</th>
                <th className="py-1.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-b">
                  <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                    <Link href={`/admin/ingest/runs/${run.id}`} className="underline hover:text-foreground">
                      {new Date(run.createdAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4">
                    <IngestStatusBadge status={run.status as "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"} />
                  </td>
                  <td className="py-1.5 pr-4 text-xs">{run.createdCandidates ?? "—"}</td>
                  <td className="py-1.5 text-xs text-destructive">{run.status === "FAILED" ? (run.errorCode ?? "FAILED") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link
            href="/admin/ingest/runs"
            className="mt-2 block text-xs text-muted-foreground underline hover:text-foreground"
          >
            View all runs →
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No extraction runs yet for this venue.</p>
      )}
    </section>
  );
}

function PipelineStat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
        {value}
      </p>
    </Link>
  );
}
