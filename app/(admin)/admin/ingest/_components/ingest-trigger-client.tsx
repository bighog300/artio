"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";

type VenueOption = {
  id: string;
  name: string;
  websiteUrl: string;
};

function getErrorMessage(status: number) {
  if (status === 400) return "This venue is missing a valid ingest source URL.";
  if (status === 401 || status === 403) return "You are not authorized to run ingest.";
  if (status === 404) return "Venue not found.";
  return "Could not start ingest run. Please try again.";
}

export default function IngestTriggerClient({ venues }: { venues: VenueOption[] }) {
  const router = useRouter();
  const [selectedVenueId, setSelectedVenueId] = useState(venues[0]?.id ?? "");
  const [isRunning, setIsRunning] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    succeeded: number;
    failed: number;
  } | null>(null);
  const [batchComplete, setBatchComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExtraction() {
    if (!selectedVenueId || isRunning) return;
    setError(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/admin/ingest/venues/${selectedVenueId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (!res.ok) {
        setError(getErrorMessage(res.status));
        return;
      }

      const payload = await res.json() as { runId: string };
      router.push(`/admin/ingest/runs/${payload.runId}`);
      router.refresh();
    } catch {
      setError("Could not start ingest run. Please try again.");
    } finally {
      setIsRunning(false);
    }
  }

  async function runAllVenues() {
    const cap = Math.min(venues.length, 50);
    const toRun = venues.slice(0, cap);
    if (toRun.length === 0) return;

    if (
      !window.confirm(
        `Run extraction for all ${toRun.length} venue${toRun.length === 1 ? "" : "s"}? This will fire ${toRun.length} sequential extraction run${toRun.length === 1 ? "" : "s"}.`,
      )
    )
      return;

    setError(null);
    setIsBatchRunning(true);
    setBatchComplete(false);
    setBatchProgress({ done: 0, total: toRun.length, succeeded: 0, failed: 0 });

    let succeeded = 0;
    let failed = 0;

    for (const venue of toRun) {
      try {
        const res = await fetch(`/api/admin/ingest/venues/${venue.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          succeeded += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      setBatchProgress({
        done: succeeded + failed,
        total: toRun.length,
        succeeded,
        failed,
      });
    }

    setIsBatchRunning(false);
    setBatchComplete(true);
    router.refresh();
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Trigger Extraction</h2>
        <p className="text-sm text-muted-foreground">Start a manual extraction run for a venue website.</p>
      </div>

      {error ? <InlineBanner>{error}</InlineBanner> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1 text-sm font-medium">
          Venue
          <select
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            value={selectedVenueId}
            onChange={(event) => setSelectedVenueId(event.target.value)}
            disabled={isRunning || venues.length === 0}
          >
            {venues.length === 0 ? <option value="">No venues with website URL available</option> : null}
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>{venue.name}</option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={runExtraction} disabled={!selectedVenueId || isRunning}>
          {isRunning ? "Running…" : "Run Extraction"}
        </Button>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Or run extraction for all {Math.min(venues.length, 50)} venue
            {Math.min(venues.length, 50) === 1 ? "" : "s"} sequentially.
            {venues.length > 50 ? " (capped at 50)" : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runAllVenues()}
            disabled={isBatchRunning || isRunning || venues.length === 0}
          >
            {isBatchRunning
              ? `Running… ${batchProgress?.done ?? 0}/${batchProgress?.total ?? 0}`
              : "Run all venues"}
          </Button>
        </div>

        {isBatchRunning && batchProgress ? (
          <div className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
            {batchProgress.done}/{batchProgress.total} venues processed
            {batchProgress.succeeded > 0 ? ` · ${batchProgress.succeeded} started` : ""}
            {batchProgress.failed > 0 ? ` · ${batchProgress.failed} failed` : ""}
          </div>
        ) : null}

        {batchComplete && batchProgress ? (
          <div
            className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
              batchProgress.failed > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
            }`}
          >
            <span>
              Batch complete: {batchProgress.succeeded} started
              {batchProgress.failed > 0 ? `, ${batchProgress.failed} failed` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setBatchComplete(false);
                setBatchProgress(null);
              }}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
