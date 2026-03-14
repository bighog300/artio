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
  const [mergeOpenById, setMergeOpenById] = useState<Record<string, boolean>>({});
  const [mergeQueryById, setMergeQueryById] = useState<Record<string, string>>({});
  const [mergeOptionsById, setMergeOptionsById] = useState<Record<string, Array<{ id: string; title: string; slug: string; artistName: string }>>>({});

  async function searchExistingArtworks(candidateId: string) {
    const query = mergeQueryById[candidateId]?.trim();
    if (!query) {
      setMergeOptionsById((prev) => ({ ...prev, [candidateId]: [] }));
      return;
    }

    setWorkingId(candidateId);
    setError(null);
    try {
      const params = new URLSearchParams({ query, pageSize: "8", page: "1", sort: "RECENT" });
      const res = await fetch(`/api/admin/artwork?${params.toString()}`, { method: "GET" });
      if (!res.ok) {
        setError("Failed to search for existing artworks.");
        return;
      }
      const data = await res.json() as {
        items: Array<{ id: string; title: string; slug: string; artist: { name: string } }>;
      };
      setMergeOptionsById((prev) => ({
        ...prev,
        [candidateId]: data.items.map((item) => ({ id: item.id, title: item.title, slug: item.slug, artistName: item.artist.name })),
      }));
    } catch {
      setError("Failed to search for existing artworks.");
    } finally {
      setWorkingId(null);
    }
  }

  async function merge(id: string, existingArtworkId: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingArtworkId }),
      });
      if (!res.ok) {
        setError("Failed to link artwork candidate to existing artwork.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to link artwork candidate to existing artwork.");
    } finally {
      setWorkingId(null);
    }
  }

  async function approve(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
        const message = body?.error?.message ?? body?.message ?? "Failed to approve artwork candidate.";
        setError(message);
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
                <td className="px-3 py-2 font-medium">
                  <div>{candidate.title}</div>
                  <div className="text-xs font-normal text-muted-foreground">Artist: {candidate.artistName ?? "—"}</div>
                </td>
                <td className="px-3 py-2">{candidate.artistName ?? "—"}</td>
                <td className="px-3 py-2">{candidate.medium ?? "—"}</td>
                <td className="px-3 py-2">{candidate.year ?? "—"}</td>
                <td className="px-3 py-2">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.title} className="h-12 w-12 rounded object-cover" /> : "—"}</td>
                <td className="px-3 py-2">
                  <Link className="underline" href={`/events/${candidate.sourceEvent.slug}`}>{candidate.sourceEvent.title}</Link>
                </td>
                <td className="px-3 py-2">{candidate.extractionProvider}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                    <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => approve(candidate.id)}>Approve</button>
                    <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => reject(candidate.id)}>Reject</button>
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        disabled={workingId === candidate.id}
                        onClick={() => setMergeOpenById((prev) => ({ ...prev, [candidate.id]: !prev[candidate.id] }))}
                      >
                        Link to existing artwork
                      </button>
                    </div>
                    {mergeOpenById[candidate.id] ? (
                      <div className="space-y-2 rounded border p-2">
                        <div className="flex gap-2">
                          <input
                            className="w-full rounded border px-2 py-1 text-xs"
                            placeholder="Search by title or slug"
                            value={mergeQueryById[candidate.id] ?? ""}
                            onChange={(event) => setMergeQueryById((prev) => ({ ...prev, [candidate.id]: event.target.value }))}
                          />
                          <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => searchExistingArtworks(candidate.id)}>Search</button>
                        </div>
                        <div className="space-y-1">
                          {(mergeOptionsById[candidate.id] ?? []).map((option) => (
                            <button
                              key={option.id}
                              className="block w-full rounded border px-2 py-1 text-left text-xs"
                              disabled={workingId === candidate.id}
                              onClick={() => merge(candidate.id, option.id)}
                            >
                              {option.title} ({option.slug}) — {option.artistName}
                            </button>
                          ))}
                          {mergeQueryById[candidate.id] && (mergeOptionsById[candidate.id] ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No results yet. Try another query.</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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
