"use client";

import Link from "next/link";
import { useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";

type Candidate = {
  id: string;
  title: string;
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  description: string | null;
  imageUrl: string | null;
  artistName: string | null;
  sourceUrl: string;
  confidenceScore: number;
  confidenceBand: string | null;
  confidenceReasons: unknown;
  extractionProvider: string;
  sourceEvent: { id: string; title: string; slug: string };
};

function getConfidenceBand(band: string | null): "HIGH" | "MEDIUM" | "LOW" {
  if (band === "HIGH" || band === "MEDIUM" || band === "LOW") return band;
  return "LOW";
}

function getConfidenceReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export default function ArtworksClient({ candidates: initial }: { candidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function approve(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to approve artwork candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to approve artwork candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  async function reject(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to reject artwork candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to reject artwork candidate.");
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
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Artist</th>
              <th className="px-3 py-2">Medium</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Image</th>
              <th className="px-3 py-2">Source event</th>
              <th className="px-3 py-2">Provider</th>
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
                <td className="px-3 py-2 font-medium">{candidate.title}</td>
                <td className="px-3 py-2">{candidate.artistName ?? "—"}</td>
                <td className="px-3 py-2">{candidate.medium ?? "—"}</td>
                <td className="px-3 py-2">{candidate.year ?? "—"}</td>
                <td className="px-3 py-2">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.title} className="h-12 w-12 rounded object-cover" /> : "—"}</td>
                <td className="px-3 py-2">
                  <Link className="underline" href={`/events/${candidate.sourceEvent.slug}`}>{candidate.sourceEvent.title}</Link>
                </td>
                <td className="px-3 py-2">{candidate.extractionProvider}</td>
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
                <td className="px-3 py-6 text-muted-foreground" colSpan={9}>No artwork candidates.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
