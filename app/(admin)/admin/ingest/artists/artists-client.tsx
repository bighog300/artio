"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
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
  status: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";
  createdArtistId: string | null;
  createdArtist?: {
    featuredAsset: { url: string } | null;
  } | null;
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
  missing: string[];
} {
  const checks = [
    { label: "bio", has: Boolean(candidate.bio?.trim()) },
    { label: "mediums", has: candidate.mediums.length > 0 },
    { label: "website", has: Boolean(candidate.websiteUrl?.trim()) },
    { label: "instagram", has: Boolean(candidate.instagramUrl?.trim()) },
    { label: "nationality", has: Boolean(candidate.nationality?.trim()) },
    { label: "birth year", has: candidate.birthYear != null },
  ];
  const present = checks.filter((c) => c.has).length;
  const missing = checks.filter((c) => !c.has).map((c) => c.label);
  return { score: Math.round((present / checks.length) * 100), missing };
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

export default function ArtistsClient({
  candidates: initial,
  userRole,
}: {
  candidates: Candidate[];
  userRole?: "USER" | "EDITOR" | "ADMIN";
}) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [editOpenById, setEditOpenById] = useState<Record<string, boolean>>({});
  const [editDraftById, setEditDraftById] = useState<Record<string, EditDraft>>({});
  const [importingImageFor, setImportingImageFor] = useState<string | null>(null);
  const [importedImageFor, setImportedImageFor] = useState<Set<string>>(new Set());
  const [importFailedFor, setImportFailedFor] = useState<Set<string>>(new Set());
  const [editingImageFor, setEditingImageFor] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<Record<string, string>>({});
  const [editingImageLoading, setEditingImageLoading] = useState<string | null>(null);
  const [editImageError, setEditImageError] = useState<Record<string, string>>({});
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

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

  const approve = useCallback(async (id: string) => {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to approve artist candidate.");
        return;
      }
      const body = await res.json() as { artistId?: string };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtistId: body.artistId ?? item.createdArtistId } : item));
      setFocusedIndex(null);
    } catch {
      setError("Failed to approve artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }, []);

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
      const body = await res.json() as { artistId?: string };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtistId: body.artistId ?? item.createdArtistId } : item));
      setEditOpenById((prev) => ({ ...prev, [id]: false }));
    } catch {
      setError("Failed to approve artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }


  async function approveAndPublish(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishImmediately: true }),
      });
      if (!res.ok) {
        setError("Failed to approve and publish artist candidate.");
        return;
      }
      const body = await res.json() as { artistId?: string };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtistId: body.artistId ?? item.createdArtistId } : item));
    } catch {
      setError("Failed to approve and publish artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }


  async function importArtistImage(candidateId: string) {
    setImportingImageFor(candidateId);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${candidateId}/import-image`, {
        method: "POST",
      });
      if (res.ok) {
        setImportedImageFor((prev) => new Set([...prev, candidateId]));
        setImportFailedFor((prev) => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
      } else {
        setImportFailedFor((prev) => new Set([...prev, candidateId]));
      }
    } catch {
      setImportFailedFor((prev) => new Set([...prev, candidateId]));
    } finally {
      setImportingImageFor(null);
    }
  }


  async function replaceArtistImage(candidateId: string, artistId: string) {
    setEditingImageLoading(candidateId);
    setEditImageError((prev) => ({ ...prev, [candidateId]: "" }));
    try {
      const sourceUrl = editImageUrl[candidateId] ?? "";
      const response = await fetch(`/api/admin/artists/${artistId}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setEditImageError((prev) => ({ ...prev, [candidateId]: body.error?.message ?? "Image replace failed" }));
        return;
      }

      setEditImageUrl((prev) => ({ ...prev, [candidateId]: "" }));
      setEditingImageFor(null);
      setImportedImageFor((prev) => new Set([...prev, candidateId]));
      setEditImageError((prev) => ({ ...prev, [candidateId]: "" }));
    } catch {
      setEditImageError((prev) => ({ ...prev, [candidateId]: "Image replace failed" }));
    } finally {
      setEditingImageLoading(null);
    }
  }

  const reject = useCallback(async (id: string) => {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to reject artist candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
      setFocusedIndex(null);
    } catch {
      setError("Failed to reject artist candidate.");
    } finally {
      setWorkingId(null);
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const pending = candidates.filter((c) => c.status === "PENDING");
      if (pending.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev === null ? 0 : (prev + 1) % pending.length));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === null ? pending.length - 1 : (prev - 1 + pending.length) % pending.length,
        );
      } else if (e.key === "a" || e.key === "A") {
        if (focusedIndex === null) return;
        const candidate = pending[focusedIndex];
        if (!candidate) return;
        e.preventDefault();
        void approve(candidate.id);
      } else if (e.key === "r" || e.key === "R") {
        if (focusedIndex === null) return;
        const candidate = pending[focusedIndex];
        if (!candidate) return;
        e.preventDefault();
        void reject(candidate.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [candidates, focusedIndex, approve, reject]);

  const pendingCandidates = candidates.filter((c) => c.status === "PENDING");
  const focusedCandidateId =
    focusedIndex !== null ? pendingCandidates[focusedIndex]?.id : null;

  return (
    <section className="rounded-lg border bg-background p-4">
      {error ? <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1560px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">img</th>
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
                <tr
                  data-candidate-id={candidate.id}
                  className={`border-b align-top ${focusedCandidateId === candidate.id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/20 dark:ring-blue-800" : ""}`}
                >
                  <td className="px-3 py-2">
                    <IngestConfidenceBadge
                      score={candidate.confidenceScore}
                      band={getConfidenceBand(candidate.confidenceBand)}
                      reasons={getConfidenceReasons(candidate.confidenceReasons)}
                      showReasons
                    />
                  </td>
                  <td className="px-3 py-2">
                    <IngestImageCell
                      imageUrl={null}
                      blobImageUrl={candidate.createdArtist?.featuredAsset?.url ?? null}
                      altText={candidate.name}
                      importStatus={
                        importedImageFor.has(candidate.id)
                          ? "imported"
                          : importFailedFor.has(candidate.id)
                            ? "failed"
                            : importingImageFor === candidate.id
                              ? "importing"
                              : "none"
                      }
                      onImport={
                        (candidate.websiteUrl || candidate.instagramUrl || candidate.sourceUrl)
                          ? () => importArtistImage(candidate.id)
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{candidate.name}</td>
                  <td className="max-w-[280px] px-3 py-2">{candidate.bio ? `${candidate.bio.slice(0, 100)}${candidate.bio.length > 100 ? "…" : ""}` : "—"}</td>
                  <td className="px-3 py-2">{candidate.mediums.length > 0 ? candidate.mediums.join(", ") : "—"}</td>
                  <td className="px-3 py-2 min-w-[160px]">
                    {(() => {
                      const { score, missing } = computeArtistCandidateCompleteness(candidate);
                      return (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                              <div
                                className={`h-full rounded ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400"}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{score}%</span>
                          </div>
                          {missing.length > 0 && (
                            <p className="text-xs text-muted-foreground leading-tight">
                              Missing: {missing.join(", ")}
                            </p>
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
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approve(candidate.id)}>Approve</Button>
                      {userRole === "ADMIN" ? (
                        <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approveAndPublish(candidate.id)}>Approve & Publish</Button>
                      ) : null}
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => toggleEdit(candidate)}>
                        {editOpenById[candidate.id] ? "Close edit" : "Edit"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => reject(candidate.id)}>Reject</Button>
                    </div>
                    {candidate.createdArtistId ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">Approved artist: <Link href={`/admin/artists/${candidate.createdArtistId}`} className="underline">{candidate.createdArtistId}</Link></p>
                        {editingImageFor !== candidate.id ? (
                          <button
                            type="button"
                            className="text-xs underline text-muted-foreground"
                            onClick={() => {
                              setEditingImageFor(candidate.id);
                              setEditImageUrl((prev) => (prev[candidate.id] !== undefined ? prev : { ...prev, [candidate.id]: candidate.sourceUrl ?? "" }));
                            }}
                          >
                            Replace image
                          </button>
                        ) : (
                          <div className="space-y-1">
                            <input
                              className="w-full rounded border px-2 py-1 text-xs"
                              placeholder="https://… image URL"
                              value={editImageUrl[candidate.id] ?? ""}
                              onChange={(event) => setEditImageUrl((prev) => ({ ...prev, [candidate.id]: event.target.value }))}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-xs"
                                disabled={editingImageLoading === candidate.id || !candidate.createdArtistId}
                                onClick={() => candidate.createdArtistId && replaceArtistImage(candidate.id, candidate.createdArtistId)}
                              >
                                {editingImageLoading === candidate.id ? "Replacing…" : "Replace"}
                              </button>
                              <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditingImageFor(null)}>
                                Cancel
                              </button>
                            </div>
                            {editImageError[candidate.id] ? <p className="text-xs text-destructive">{editImageError[candidate.id]}</p> : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
                {editOpenById[candidate.id] ? (
                  <tr className="border-b">
                    <td colSpan={10} className="px-3 pb-3">
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
                        {userRole === "ADMIN" ? (
                          <Button size="sm" variant="outline" disabled={workingId === candidate.id} onClick={() => approveAndPublish(candidate.id)}>
                            Approve & Publish
                          </Button>
                        ) : null}
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
                <td className="px-3 py-6 text-muted-foreground" colSpan={10}>No artist candidates.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <kbd className="rounded border px-1 font-mono">J</kbd>{" / "}
        <kbd className="rounded border px-1 font-mono">K</kbd> navigate{" · "}
        <kbd className="rounded border px-1 font-mono">A</kbd> approve{" · "}
        <kbd className="rounded border px-1 font-mono">R</kbd> reject
      </p>
    </section>
  );
}
