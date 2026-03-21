import Link from "next/link";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import { InlineBanner } from "@/components/ui/inline-banner";
import { db } from "@/lib/db";
import { getAdminIngestHealthData } from "@/lib/ingest/health-query";

export default async function AdminIngestHealthPage() {
  const data = await getAdminIngestHealthData(db);
  const cronConfig = {
    schedule: "02:50 UTC daily (vercel.json)",
    maxVenues: process.env.AI_INGEST_CRON_MAX_VENUES ?? "10",
    timeBudgetMs: process.env.AI_INGEST_CRON_TIME_BUDGET_MS ?? "120000",
    maxTotalCandidates: process.env.AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES ?? "100",
    candidateCapPerRun: process.env.AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN ?? "25",
    duplicateLookbackDays: process.env.AI_INGEST_DUPLICATE_LOOKBACK_DAYS ?? "30",
    cbWindowHours: process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS ?? "6",
    cbMinRuns: process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS ?? "5",
    cbFailRate: process.env.AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE ?? "0.6",
    similarityThreshold: process.env.AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD ?? "85",
    confidenceHighMin: process.env.AI_INGEST_CONFIDENCE_HIGH_MIN ?? "75",
    confidenceMediumMin: process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN ?? "45",
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Ingest Health" description="7-day ingestion reliability and volume guardrail signals." />
      <div><Link href="/admin/ingest" className="text-sm underline">Back to Ingest</Link></div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Runs (7d)</p><p className="text-2xl font-semibold">{data.last7Days.totalRuns}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Success rate</p><p className="text-2xl font-semibold">{(data.last7Days.successRate * 100).toFixed(1)}%</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Avg created candidates</p><p className="text-2xl font-semibold">{data.last7Days.avgCreatedCandidates.toFixed(1)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Avg duration</p><p className="text-2xl font-semibold">{Math.round(data.last7Days.avgDurationMs)}ms</p></div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-base font-semibold">Circuit breaker</h2>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${data.circuitBreaker.open ? "bg-amber-500" : "bg-green-500"}`} />
          <span className={`font-semibold ${data.circuitBreaker.open ? "text-amber-600" : "text-emerald-600"}`}>
            {data.circuitBreaker.open ? "OPEN" : "CLOSED"}
          </span>
        </div>
        {data.circuitBreaker.open ? (
          <div className="mt-3">
            <InlineBanner>
              The circuit breaker is open. Cron ingestion is currently suppressed because the recent failure
              rate exceeded the configured threshold. Resolve the underlying fetch or extraction errors and
              the breaker will reset automatically once the window passes.
            </InlineBanner>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">Fail rate: {(data.circuitBreaker.failRate * 100).toFixed(1)}% ({data.circuitBreaker.runCount} runs)</p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-base font-semibold">Top error codes (7d)</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {data.last7Days.topErrorCodes.map((row) => <li key={row.errorCode}>{row.errorCode}: {row.count}</li>)}
          {data.last7Days.topErrorCodes.length === 0 ? <li className="text-muted-foreground">No failures.</li> : null}
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-1 text-base font-semibold">Venue performance (7d)</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Events created per run, confidence distribution, and approval rate
          for venues with activity in the last 7 days. Venues flagged as
          &quot;noise&quot; have &lt;20% HIGH confidence candidates — consider tuning
          the extraction prompt or removing from the active schedule.
        </p>
        {data.venuePerformance.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No venue runs in the last 7 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">Runs</th>
                  <th className="px-3 py-2">Avg/run</th>
                  <th className="px-3 py-2">HIGH</th>
                  <th className="px-3 py-2">MED</th>
                  <th className="px-3 py-2">LOW</th>
                  <th className="px-3 py-2">Approval</th>
                  <th className="px-3 py-2">Signal</th>
                </tr>
              </thead>
              <tbody>
                {data.venuePerformance.map((row) => (
                  <tr key={row.venueId} className="border-b align-middle">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/venues/${row.venueId}`}
                        className="underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.runCount}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {row.avgPerRun}
                    </td>
                    <td className="px-3 py-2 text-emerald-700">
                      {row.high > 0 ? row.high : "—"}
                    </td>
                    <td className="px-3 py-2 text-amber-700">
                      {row.medium > 0 ? row.medium : "—"}
                    </td>
                    <td className="px-3 py-2 text-rose-700">
                      {row.low > 0 ? row.low : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.approvalRate !== null
                        ? `${Math.round(row.approvalRate * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.qualitySignal === "noise" ? (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                          noise
                        </span>
                      ) : row.qualitySignal === "low" ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          low yield
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                          good
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-base font-semibold">Runs in last 24h</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead><tr className="border-b text-left"><th className="px-3 py-2">Created</th><th className="px-3 py-2">Venue</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Deduped</th><th className="px-3 py-2">Error</th></tr></thead>
            <tbody>
              {data.last24hRuns.map((run) => (
                <tr key={run.id} className="border-b align-top">
                  <td className="px-3 py-2">{new Date(run.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{run.venueName ?? run.venueId}</td>
                  <td className="px-3 py-2"><IngestStatusBadge status={run.status} /></td>
                  <td className="px-3 py-2">{run.createdCandidates}</td>
                  <td className="px-3 py-2">{run.dedupedCandidates}</td>
                  <td className="px-3 py-2">{run.errorCode ?? "—"}</td>
                </tr>
              ))}
              {data.last24hRuns.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-muted-foreground">No runs in last 24h.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Active configuration</h2>
          <p className="text-sm text-muted-foreground">Environment-driven ingest parameters currently in effect.</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Cron schedule</dt><dd><code>{cronConfig.schedule}</code></dd></div>
          <div><dt className="text-muted-foreground">Max venues per cron run</dt><dd><code>{cronConfig.maxVenues}</code></dd></div>
          <div><dt className="text-muted-foreground">Time budget</dt><dd><code>{cronConfig.timeBudgetMs}ms</code></dd></div>
          <div><dt className="text-muted-foreground">Max total candidates per cron</dt><dd><code>{cronConfig.maxTotalCandidates}</code></dd></div>
          <div><dt className="text-muted-foreground">Candidate cap per venue run</dt><dd><code>{cronConfig.candidateCapPerRun}</code></dd></div>
          <div><dt className="text-muted-foreground">Duplicate lookback</dt><dd><code>{cronConfig.duplicateLookbackDays} days</code></dd></div>
          <div><dt className="text-muted-foreground">CB window</dt><dd><code>{cronConfig.cbWindowHours}h</code></dd></div>
          <div><dt className="text-muted-foreground">CB min runs</dt><dd><code>{cronConfig.cbMinRuns}</code></dd></div>
          <div><dt className="text-muted-foreground">CB fail rate threshold</dt><dd><code>{cronConfig.cbFailRate}</code></dd></div>
          <div><dt className="text-muted-foreground">Similarity threshold</dt><dd><code>{cronConfig.similarityThreshold}</code></dd></div>
          <div><dt className="text-muted-foreground">Confidence HIGH min</dt><dd><code>{cronConfig.confidenceHighMin}</code></dd></div>
          <div><dt className="text-muted-foreground">Confidence MEDIUM min</dt><dd><code>{cronConfig.confidenceMediumMin}</code></dd></div>
        </dl>
      </section>
    </div>
  );
}
