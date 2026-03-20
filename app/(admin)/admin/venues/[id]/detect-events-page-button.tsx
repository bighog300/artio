"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DetectEventsPageButton({ venueId, initialUrl }: {
  venueId: string;
  initialUrl: string | null;
}) {
  void initialUrl;
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<{
    detected: boolean;
    eventsPageUrl: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function detect() {
    setDetecting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/venues/${venueId}/detect-events-page`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        detected: boolean;
        eventsPageUrl: string | null;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Detection failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Detection failed — check the venue has a valid website URL.");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void detect()}
        disabled={detecting}
      >
        {detecting ? "Detecting…" : "Auto-detect events page URL"}
      </Button>
      {result !== null ? (
        <p className="text-sm text-muted-foreground">
          {result.detected
            ? `Detected and saved: ${result.eventsPageUrl}`
            : "No events page found — set it manually above."}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
