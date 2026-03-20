"use client";

import { useState } from "react";

const OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly (default)" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "MANUAL", label: "Manual only (skip cron)" },
] as const;

export function IngestFrequencySelect({
  venueId,
  initial,
}: {
  venueId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setValue(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestFrequency: next }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError("Failed to save.");
      }
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background p-4 space-y-2">
      <div>
        <h2 className="text-base font-semibold">Ingest frequency</h2>
        <p className="text-sm text-muted-foreground">
          How often the cron should extract events for this venue.
          Manual means the cron will skip this venue entirely.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={value}
          disabled={saving}
          onChange={(e) => void save(e.target.value)}
        >
          {OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {saving ? (
          <span className="text-xs text-muted-foreground">Saving…</span>
        ) : saved ? (
          <span className="text-xs text-emerald-600">Saved</span>
        ) : null}
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
