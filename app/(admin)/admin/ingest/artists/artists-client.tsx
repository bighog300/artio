"use client";

import { useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";

type Candidate = {
  id: string;
  name: string;
  bio: string | null;
  mediums: string[];
  sourceUrl: string;
  confidenceScore: number;
  confidenceBand: string | null;
  confidenceReasons: unknown;
  extractionProvider: string;
  eventLinks: Array<{ eventId: string; event: { title: string; slug: string } }>;
};

function getConfidenceBand(band: string | null): "HIGH" | "MEDIUM" | "LOW" {
  if (band === "HIGH" || band === "MEDIUM" || band === "LOW") return band;
  return "LOW";
}

function getConfidenceReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export default function ArtistsClient({ candidates: initial }: { candidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function approve(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to approve artist candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to approve artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  async function reject(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to reject artist candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to reject artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      {error ? <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Bio</th>
              <th className="px-3 py-2">Mediums</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Events waiting</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.id} className="border-b align-top">
                <td className="px-3 py-2">
                  <IngestConfidenceBadge
                    score={candidate.confidenceScore}
                    band={getConfidenceBand(candidate.confidenceBand)}
                    reasons={getConfidenceReasons(candidate.confidenceReasons)}
                    showReasons
                  />
                </td>
                <td className="px-3 py-2 font-medium">{candidate.name}</td>
                <td className="max-w-[280px] px-3 py-2">{candidate.bio ? `${candidate.bio.slice(0, 100)}${candidate.bio.length > 100 ? "…" : ""}` : "—"}</td>
                <td className="px-3 py-2">{candidate.mediums.length > 0 ? candidate.mediums.join(", ") : "—"}</td>
                <td className="max-w-[280px] px-3 py-2">
                  <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="underline">Source</a>
                </td>
                <td className="px-3 py-2">{candidate.extractionProvider}</td>
                <td className="px-3 py-2">{candidate.eventLinks.length}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => approve(candidate.id)}>Approve</button>
                    <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => reject(candidate.id)}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
            {candidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={8}>No artist candidates.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
