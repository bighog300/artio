"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type CronTriggerProps = {
  label: string;
  endpoint: string;
};

function CronTriggerButton({ label, endpoint }: CronTriggerProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        setResult("Done");
        enqueueToast({ title: `${label} completed`, variant: "success" });
      } else {
        setResult(`Failed (${res.status})`);
        enqueueToast({ title: `${label} failed`, variant: "error" });
      }
    } catch {
      setResult("Error");
      enqueueToast({ title: "Request failed", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void handleClick()}
      >
        {busy ? "Running…" : label}
      </Button>
      {result ? (
        <span className="text-xs text-muted-foreground">{result}</span>
      ) : null}
    </span>
  );
}

export function CronTriggerButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <CronTriggerButton
        label="Outbox dry run"
        endpoint="/api/cron/outbox/send?dryRun=1"
      />
      <CronTriggerButton
        label="Digest dry run"
        endpoint="/api/cron/digests/weekly?dryRun=1"
      />
    </div>
  );
}
