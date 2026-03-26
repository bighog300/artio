"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DAY_NAMES,
  type OpeningHours,
  type OpeningHoursDay,
  parseOpeningHours,
} from "@/lib/validators/opening-hours";

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function OpeningHoursEditor({
  initialHours,
  saveUrl,
}: {
  initialHours: unknown;
  saveUrl: string;
}) {
  const parsed = parseOpeningHours(initialHours) ?? DISPLAY_ORDER.map((day) => ({
    day,
    open: "09:00",
    close: "18:00",
    closed: false,
  }));

  const [hours, setHours] = useState<OpeningHours>(parsed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(
    day: number,
    field: keyof OpeningHoursDay,
    value: string | boolean,
  ) {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, [field]: value } : h)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(saveUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingHours: hours }),
      });
      if (!res.ok) {
        setError("Save failed. Please try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="w-28 py-2 pr-4">Day</th>
            <th className="py-2 pr-4">Closed</th>
            <th className="py-2 pr-4">Opens</th>
            <th className="py-2">Closes</th>
          </tr>
        </thead>
        <tbody>
          {DISPLAY_ORDER.map((day) => {
            const entry = hours.find((h) => h.day === day)
              ?? { day, open: "", close: "", closed: false };
            return (
              <tr key={day} className="border-b">
                <td className="py-2 pr-4 font-medium">{DAY_NAMES[day]}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={entry.closed}
                    onChange={(e) => updateDay(day, "closed", e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="time"
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    value={entry.open ?? ""}
                    disabled={entry.closed}
                    onChange={(e) => updateDay(day, "open", e.target.value)}
                  />
                </td>
                <td className="py-2">
                  <input
                    type="time"
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    value={entry.close ?? ""}
                    disabled={entry.closed}
                    onChange={(e) => updateDay(day, "close", e.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save hours"}
        </Button>
        {saved ? <span className="text-sm text-emerald-700">Saved</span> : null}
      </div>
    </div>
  );
}
