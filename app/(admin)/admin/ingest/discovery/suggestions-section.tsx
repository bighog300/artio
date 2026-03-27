"use client";

import { useState } from "react";
import { SuggestionsPanel, type SuggestionRow } from "@/app/(admin)/admin/ingest/discovery/suggestions-panel";

type Props = {
  initialSuggestions: SuggestionRow[];
  entityType?: "VENUE" | "ARTIST";
  region?: string;
  country?: string;
  goalId?: string;
  regionId?: string;
};

export function SuggestionsSection({
  initialSuggestions,
  entityType,
  region,
  country,
  goalId,
  regionId,
}: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>(initialSuggestions);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [dismissing, setDismissing] = useState<Record<string, boolean>>({});
  const [genError, setGenError] = useState<string | null>(null);

  async function generateSuggestions() {
    setGenerating(true);
    setGenError(null);

    try {
      const body: Record<string, unknown> = { count: 5 };
      if (entityType) body.entityType = entityType;
      if (region) body.region = region;
      if (country) body.country = country;
      if (goalId) body.goalId = goalId;
      if (regionId) body.regionId = regionId;

      const res = await fetch("/api/admin/discovery/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setGenError(
          (err as { message?: string }).message
          ?? (err as { error?: { message?: string } }).error?.message
          ?? "Generation failed",
        );
        setTimeout(() => setGenError(null), 5000);
        return;
      }

      const data = await res.json();
      const newItems = (data.suggestions ?? []) as SuggestionRow[];
      setSuggestions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        return [
          ...newItems.filter((s) => !existingIds.has(s.id)),
          ...prev,
        ];
      });
    } finally {
      setGenerating(false);
    }
  }

  async function approveSuggestion(id: string) {
    setApproving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/discovery/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) return;
      setSuggestions((prev) => prev.map((item) => (item.id === id ? { ...item, status: "APPROVED" } : item)));
    } finally {
      setApproving((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function dismissSuggestion(id: string) {
    setDismissing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/discovery/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) return;
      setSuggestions((prev) => prev.map((item) => (item.id === id ? { ...item, status: "DISMISSED" } : item)));
    } finally {
      setDismissing((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Template suggestions
        </h2>
        <button
          type="button"
          disabled={generating}
          onClick={() => void generateSuggestions()}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate suggestions"}
        </button>
      </div>

      {genError ? (
        <p className="mb-2 text-sm text-rose-600">
          {genError}
        </p>
      ) : null}

      <SuggestionsPanel
        rows={suggestions}
        onApprove={approveSuggestion}
        onDismiss={dismissSuggestion}
        approving={approving}
        dismissing={dismissing}
      />
    </section>
  );
}
