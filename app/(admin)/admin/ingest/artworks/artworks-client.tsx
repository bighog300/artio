"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import { Button } from "@/components/ui/button";

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

type EditDraft = {
  title: string;
  artistName: string;
  medium: string;
  year: string;
  dimensions: string;
  description: string;
};

function getConfidenceBand(band: string | null): "HIGH" | "MEDIUM" | "LOW" {
  if (band === "HIGH" || band === "MEDIUM" || band === "LOW") return band;
  return "LOW";
}

function getConfidenceReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function getInitialDraft(candidate: Candidate): EditDraft {
  return {
    title: candidate.title,
    artistName: candidate.artistName ?? "",
    medium: candidate.medium ?? "",
    year: candidate.year == null ? "" : String(candidate.year),
    dimensions: candidate.dimensions ?? "",
    description: candidate.description ?? "",
  };
}

export default function ArtworksClient({ candidates: initial }: { candidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [mergeOpenById, setMergeOpenById] = useState<Record<string, boolean>>({});
  const [mergeQueryById, setMergeQueryById] = useState<Record<string, string>>({});
  const [mergeOptionsById, setMergeOptionsById] = useState<Record<string, Array<{ id: string; title: string; slug: string; artistName: string }>>>({});
  const [editOpenById, setEditOpenById] = useState<Record<string, boolean>>({});
  const [editDraftById, setEditDraftById] = useState<Record<string, EditDraft>>({});

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setEditDraftById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {
          title: "",
          artistName: "",
          medium: "",
          year: "",
          dimensions: "",
          description: "",
        }),
        [field]: value,
      },
    }));
  }

  function toggleEdit(candidate: Candidate) {
    setEditOpenById((prev) => {
      const nextOpen = !prev[candidate.id];
      if (nextOpen) {
        setEditDraftById((draftPrev) => ({
          ...draftPrev,
          [candidate.id]: draftPrev[candidate.id] ?? getInitialDraft(candidate),
        }));
      }
      return { ...prev, [candidate.id]: nextOpen };
    });
  }

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
        setError("Failed to approve artwork candidate due to an unexpected server error.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Failed to approve artwork candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  async function approveWithPatch(id: string) {
    const draft = editDraftById[id];
    if (!draft) {
      await approve(id);
      return;
    }

    const payload: Record<string, string | number | null> = {};
    if (draft.title.trim()) payload.title = draft.title;
    if (draft.artistName.trim()) payload.artistName = draft.artistName;
    if (draft.medium.trim()) payload.medium = draft.medium;
    if (draft.dimensions.trim()) payload.dimensions = draft.dimensions;
    if (draft.description.trim()) payload.description = draft.description;

    const parsedYear = Number.parseInt(draft.year, 10);
    payload.year = Number.isNaN(parsedYear) ? null : parsedYear;

    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("Failed to approve artwork candidate due to an unexpected server error.");
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
        <table className="w-full min-w-[1300px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">img</th>
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
              <Fragment key={candidate.id}>
                <tr className="border-b align-top">
                  <td className="px-3 py-2">
                    {candidate.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={candidate.imageUrl}
                        alt={candidate.title}
                        className="h-14 w-20 rounded object-cover bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-14 w-20 rounded bg-muted" />
                    )}
                  </td>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td className="px-3 py-2">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.title} className="h-12 w-12 rounded object-cover" /> : "—"}</td>
                  <td className="px-3 py-2">
                    <Link className="underline" href={`/events/${candidate.sourceEvent.slug}`}>{candidate.sourceEvent.title}</Link>
                  </td>
                  <td className="px-3 py-2">{candidate.extractionProvider}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => approve(candidate.id)}>Approve</button>
                        <button className="rounded border px-2 py-1 text-xs" disabled={workingId === candidate.id} onClick={() => reject(candidate.id)}>Reject</button>
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          disabled={workingId === candidate.id}
                          onClick={() => toggleEdit(candidate)}
                        >
                          Edit before approving
                        </button>
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
                {editOpenById[candidate.id] ? (
                  <tr className="border-b">
                    <td colSpan={10} className="px-3 pb-3">
                      <div className="grid grid-cols-2 gap-2 rounded border bg-muted/30 p-3 text-sm">
                        <label className="flex flex-col gap-1">
                          Title
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.title ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "title", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Artist name
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.artistName ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "artistName", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Medium
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.medium ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "medium", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Year
                          <input
                            type="number"
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.year ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "year", e.target.value)}
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1">
                          Dimensions
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.dimensions ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "dimensions", e.target.value)}
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1">
                          Description
                          <textarea
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.description ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "description", e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" disabled={workingId === candidate.id} onClick={() => approveWithPatch(candidate.id)}>
                          Save + approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditOpenById((prev) => ({ ...prev, [candidate.id]: false }))}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {candidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={10}>No artwork candidates.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
