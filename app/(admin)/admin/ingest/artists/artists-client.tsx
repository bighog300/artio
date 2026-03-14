"use client";

import { Fragment, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import { Button } from "@/components/ui/button";

type Candidate = {
  id: string;
  name: string;
  bio: string | null;
  mediums: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  nationality: string | null;
  birthYear: number | null;
  sourceUrl: string;
  confidenceScore: number;
  confidenceBand: string | null;
  confidenceReasons: unknown;
  extractionProvider: string;
  eventLinks: Array<{ eventId: string; event: { title: string; slug: string } }>;
};

type EditDraft = {
  name: string;
  bio: string;
  mediums: string;
  websiteUrl: string;
  instagramUrl: string;
};

function computeArtistCandidateCompleteness(candidate: Candidate): {
  score: number;
  present: string[];
  missing: string[];
} {
  const checks = [
    { key: "bio", label: "bio", has: Boolean(candidate.bio?.trim()) },
    { key: "mediums", label: "mediums", has: candidate.mediums.length > 0 },
    { key: "website", label: "website", has: Boolean(candidate.websiteUrl?.trim()) },
    { key: "instagram", label: "instagram", has: Boolean(candidate.instagramUrl?.trim()) },
    { key: "nationality", label: "nationality", has: Boolean(candidate.nationality) },
    { key: "birthYear", label: "birth year", has: candidate.birthYear != null },
  ];
  const present = checks.filter((c) => c.has).map((c) => c.label);
  const missing = checks.filter((c) => !c.has).map((c) => c.label);
  const score = Math.round((present.length / checks.length) * 100);
  return { score, present, missing };
}

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
    name: candidate.name,
    bio: candidate.bio ?? "",
    mediums: candidate.mediums.join(", "),
    websiteUrl: candidate.websiteUrl ?? "",
    instagramUrl: candidate.instagramUrl ?? "",
  };
}

export default function ArtistsClient({ candidates: initial }: { candidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [editOpenById, setEditOpenById] = useState<Record<string, boolean>>({});
  const [editDraftById, setEditDraftById] = useState<Record<string, EditDraft>>({});

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setEditDraftById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { name: "", bio: "", mediums: "", websiteUrl: "", instagramUrl: "" }),
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

  async function approveWithPatch(id: string) {
    const draft = editDraftById[id];
    if (!draft) {
      await approve(id);
      return;
    }

    setWorkingId(id);
    setError(null);
    try {
      const payload: {
        name?: string;
        bio?: string | null;
        mediums?: string[];
        websiteUrl?: string | null;
        instagramUrl?: string | null;
      } = {};

      if (draft.name.trim()) payload.name = draft.name;
      payload.bio = draft.bio.trim() ? draft.bio : null;
      payload.mediums = draft.mediums.split(",").map((s) => s.trim()).filter(Boolean);
      payload.websiteUrl = draft.websiteUrl.trim() ? draft.websiteUrl : null;
      payload.instagramUrl = draft.instagramUrl.trim() ? draft.instagramUrl : null;

      const res = await fetch(`/api/admin/ingest/artists/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("Failed to approve artist candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
      setEditOpenById((prev) => ({ ...prev, [id]: false }));
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
        <table className="w-full min-w-[1380px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Bio</th>
              <th className="px-3 py-2">Mediums</th>
              <th className="px-3 py-2">Completeness</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Events waiting</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <Fragment key={candidate.id}>
                <tr className="border-b align-top">
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
                  <td className="px-3 py-2">
                    {(() => {
                      const { score, missing } = computeArtistCandidateCompleteness(candidate);
                      return (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-20 overflow-hidden rounded bg-muted">
                              <div
                                className={`h-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400"}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{score}%</span>
                          </div>
                          {missing.length > 0 && (
                            <p className="text-xs text-muted-foreground">Missing: {missing.join(", ")}</p>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="underline">Source</a>
                  </td>
                  <td className="px-3 py-2">{candidate.extractionProvider}</td>
                  <td className="px-3 py-2">{candidate.eventLinks.length}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id} onClick={() => approve(candidate.id)}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id} onClick={() => toggleEdit(candidate)}>
                        {editOpenById[candidate.id] ? "Close edit" : "Edit"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id} onClick={() => reject(candidate.id)}>Reject</Button>
                    </div>
                  </td>
                </tr>
                {editOpenById[candidate.id] ? (
                  <tr className="border-b">
                    <td colSpan={9} className="px-3 pb-3">
                      <div className="grid grid-cols-2 gap-2 rounded border bg-muted/30 p-3 text-sm">
                        <label className="flex flex-col gap-1">
                          Name
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.name ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "name", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Mediums (comma-separated)
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.mediums ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "mediums", e.target.value)}
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1">
                          Bio
                          <textarea
                            rows={4}
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.bio ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "bio", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Website URL
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.websiteUrl ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "websiteUrl", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Instagram URL
                          <input
                            className="rounded border px-2 py-1 text-sm"
                            value={editDraftById[candidate.id]?.instagramUrl ?? ""}
                            onChange={(e) => updateDraft(candidate.id, "instagramUrl", e.target.value)}
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
                <td className="px-3 py-6 text-muted-foreground" colSpan={9}>No artist candidates.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
