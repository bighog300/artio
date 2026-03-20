"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export function BackfillArtworksTrigger() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/cron/ingest/backfill-artworks", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        processed?: number;
        created?: number;
      };

      if (res.ok) {
        setResult(
          `Backfill complete: ${data.processed ?? "?"} events checked, ${data.created ?? "?"} artworks queued.`
        );
      } else {
        setResult("Backfill failed — check logs.");
      }
    } catch {
      setResult("Backfill failed — check logs.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-2 rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Backfill artwork extraction</h2>
          <p className="text-sm text-muted-foreground">
            Extract artworks for approved events that have none yet. Processes
            up to 50 events.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void trigger()}
          disabled={running}
        >
          {running ? "Running…" : "Run backfill"}
        </Button>
      </div>
      {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
    </section>
  );
}
