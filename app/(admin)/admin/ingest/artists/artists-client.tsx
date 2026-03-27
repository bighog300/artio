"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
import { Button } from "@/components/ui/button";
import { computeArtistCompleteness } from "@/lib/artist-completeness";

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
  lastApprovalAttemptAt: string | Date | null;
  lastApprovalError: string | null;
  imageImportStatus: string | null;
  imageImportWarning: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";
  createdArtistId: string | null;
  image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
  createdArtist?: {
    featuredAsset: { url: string } | null;
  } | null;
  eventLinks: Array<{
    eventId: string;
    event: {
      title: string;
      slug: string;
      venue: { name: string; slug: string } | null;
    };
  }>;
};

function formatCompactTimestamp(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function truncateWithTitle(value: string, max = 80): { text: string; title?: string } {
  if (value.length <= max) return { text: value };
  return { text: `${value.slice(0, max - 1)}…`, title: value };
}

function getApprovalState(candidate: Candidate): { tone: "muted" | "ok" | "warn"; label: string; detail?: string } {
  if (!candidate.lastApprovalAttemptAt) {
    return { tone: "muted", label: "Approval: Not attempted" };
  }
  if (candidate.lastApprovalError) {
    const at = formatCompactTimestamp(candidate.lastApprovalAttemptAt);
    return {
      tone: "warn",
      label: at ? `Approval failed (${at})` : "Approval failed",
      detail: candidate.lastApprovalError,
    };
  }
  const at = formatCompactTimestamp(candidate.lastApprovalAttemptAt);
  return {
    tone: "ok",
    label: at ? `Approval attempted (${at})` : "Approval attempted",
  };
}

function getPersistedImageStatusLabel(status: string | null): { tone: "muted" | "ok" | "warn"; label: string } {
  switch (status) {
    case "imported":
      return { tone: "ok", label: "Image: Imported" };
    case "failed":
      return { tone: "warn", label: "Image: Failed" };
    case "no_image_found":
      return { tone: "muted", label: "Image: No image found" };
    case "not_attempted":
    case null:
      return { tone: "muted", label: "Image: Not attempted" };
    default:
      return { tone: "muted", label: `Image: ${status}` };
  }
}

function getStatusToneClass(tone: "muted" | "ok" | "warn"): string {
  if (tone === "ok") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  return "text-muted-foreground";
}

type EditDraft = {
  name: string;
  bio: string;
  mediums: string;
  websiteUrl: string;
  instagramUrl: string;
};

type ApprovalFilter = "all" | "failed" | "attempted" | "not_attempted";
type ImageFilter = "all" | "failed" | "no_image_found" | "imported" | "not_attempted";

function matchesApprovalFilter(candidate: Candidate, filter: ApprovalFilter): boolean {
  if (filter === "all") return true;
  if (filter === "failed") return Boolean(candidate.lastApprovalError);
  if (filter === "attempted") {
    return Boolean(candidate.lastApprovalAttemptAt) && !candidate.lastApprovalError;
  }
  return !candidate.lastApprovalAttemptAt;
}

function matchesImageFilter(candidate: Candidate, filter: ImageFilter): boolean {
  if (filter === "all") return true;
  if (filter === "not_attempted") {
    return !candidate.imageImportStatus || candidate.imageImportStatus === "not_attempted";
  }
  return candidate.imageImportStatus === filter;
}

function matchesReasonCodeFilter(candidate: Candidate, reasonCode: string): boolean {
  const normalizedReasonCode = reasonCode.trim().toLowerCase();
  if (!normalizedReasonCode) return true;
  const approvalReason = candidate.lastApprovalError?.toLowerCase() ?? "";
  const imageWarningReason = candidate.imageImportWarning?.toLowerCase() ?? "";
  return approvalReason.includes(normalizedReasonCode) || imageWarningReason.includes(normalizedReasonCode);
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
  const [importedImageById, setImportedImageById] = useState<Record<string, { url: string | null; isProcessing?: boolean; hasFailure?: boolean }>>({});
  const [editingImageFor, setEditingImageFor] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<Record<string, string>>({});
  const [editingImageLoading, setEditingImageLoading] = useState<string | null>(null);
  const [editImageError, setEditImageError] = useState<Record<string, string>>({});
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [expandedEventLinks, setExpandedEventLinks] = useState<Record<string, boolean>>({});
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ approved: number; failed: number } | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [reasonCodeFilter, setReasonCodeFilter] = useState("");

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

  async function bulkApproveHigh() {
    const highCandidates = candidates.filter(
      (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
    );
    if (highCandidates.length === 0) return;
    if (
      !window.confirm(
        `Approve all ${highCandidates.length} HIGH ` +
          `confidence artist candidate` +
          `${highCandidates.length === 1 ? "" : "s"}? ` +
          "This cannot be undone.",
      )
    ) {
      return;
    }

    setBulkApproving(true);
    setBulkResults(null);
    setBulkProgress({ done: 0, total: highCandidates.length });

    const BATCH_SIZE = 5;
    let approved = 0;
    let failed = 0;

    for (let i = 0; i < highCandidates.length; i += BATCH_SIZE) {
      const batch = highCandidates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((candidate) =>
          fetch(`/api/admin/ingest/artists/${candidate.id}/approve`, { method: "POST" })
            .then((res) => (res.ok ? ("ok" as const) : ("fail" as const)))
            .catch(() => "fail" as const),
        ),
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value === "ok") {
          approved += 1;
        } else {
          failed += 1;
        }
      }
      setBulkProgress({
        done: approved + failed,
        total: highCandidates.length,
      });
    }

    setBulkApproving(false);
    setBulkProgress(null);
    setBulkResults({ approved, failed });

    setCandidates((prev) =>
      prev.filter((c) => !(c.confidenceBand === "HIGH" && c.status === "PENDING")),
    );
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
        const body = await res.json() as {
          attached?: boolean;
          image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
          warning?: string | null;
        };
        const importedImage = body.image ?? null;
        if (importedImage) {
          setImportedImageById((prev) => ({ ...prev, [candidateId]: importedImage }));
        }
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

      const replaceBody = (await response.json().catch(() => ({}))) as { url?: string | null };
      const replacedImageUrl = replaceBody.url;
      if (typeof replacedImageUrl === "string" && replacedImageUrl.length > 0) {
        setImportedImageById((prev) => ({ ...prev, [candidateId]: { url: replacedImageUrl } }));
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

  const filteredCandidates = candidates.filter(
    (candidate) =>
      matchesApprovalFilter(candidate, approvalFilter) &&
      matchesImageFilter(candidate, imageFilter) &&
      matchesReasonCodeFilter(candidate, reasonCodeFilter),
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const pending = filteredCandidates.filter((c) => c.status === "PENDING");
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
        if (!candidate || candidate.status !== "PENDING") return;
        e.preventDefault();
        const row = document.querySelector(`[data-candidate-id="${candidate.id}"]`);
        const approveBtn = row?.querySelector<HTMLButtonElement>("button[data-action='approve']");
        approveBtn?.click();
      } else if (e.key === "r" || e.key === "R") {
        if (focusedIndex === null) return;
        const candidate = pending[focusedIndex];
        if (!candidate || candidate.status !== "PENDING") return;
        e.preventDefault();
        const row = document.querySelector(`[data-candidate-id="${candidate.id}"]`);
        const rejectBtn = row?.querySelector<HTMLButtonElement>("button[data-action='reject']");
        rejectBtn?.click();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredCandidates, focusedIndex]);

  const pendingCandidates = filteredCandidates.filter((c) => c.status === "PENDING");
  const focusedCandidateId =
    focusedIndex !== null ? pendingCandidates[focusedIndex]?.id : null;

  return (
    <section className="rounded-lg border bg-background p-4">
      {error ? <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{error}</div> : null}
      <div className="mb-3 flex flex-col gap-2">
        {(() => {
          const highCount = candidates.filter(
            (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
          ).length;
          if (highCount === 0) return null;
          return (
            <button
              type="button"
              className="w-fit rounded border border-emerald-600 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              disabled={bulkApproving}
              onClick={() => void bulkApproveHigh()}
            >
              {bulkApproving
                ? `Approving… ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? highCount}`
                : `Approve all HIGH (${highCount})`}
            </button>
          );
        })()}

        {bulkResults ? (
          <div
            className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
              bulkResults.failed > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
            }`}
          >
            <span>
              Bulk approve complete: {bulkResults.approved} approved
              {bulkResults.failed > 0 ? `, ${bulkResults.failed} failed` : ""}
            </span>
            <button type="button" onClick={() => setBulkResults(null)}>
              ×
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Approval
            <select
              value={approvalFilter}
              onChange={(event) => setApprovalFilter(event.target.value as ApprovalFilter)}
              className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="all">All</option>
              <option value="failed">Approval failed</option>
              <option value="attempted">Approval attempted</option>
              <option value="not_attempted">Not attempted</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Image
            <select
              value={imageFilter}
              onChange={(event) => setImageFilter(event.target.value as ImageFilter)}
              className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="all">All</option>
              <option value="failed">Image failed</option>
              <option value="no_image_found">No image found</option>
              <option value="imported">Imported</option>
              <option value="not_attempted">Not attempted</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reason code
            <input
              value={reasonCodeFilter}
              onChange={(event) => setReasonCodeFilter(event.target.value)}
              placeholder="slug_collision, image_fetch_failed…"
              className="w-64 rounded border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <span className="rounded border bg-muted/40 px-2 py-1">Approval failures ({candidates.filter((candidate) => Boolean(candidate.lastApprovalError)).length})</span>
            <span className="rounded border bg-muted/40 px-2 py-1">Image failed ({candidates.filter((candidate) => candidate.imageImportStatus === "failed").length})</span>
            <span className="rounded border bg-muted/40 px-2 py-1">No image found ({candidates.filter((candidate) => candidate.imageImportStatus === "no_image_found").length})</span>
          </div>
        </div>
      </div>
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
              <th className="px-3 py-2">Observability</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((candidate) => (
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
                      blobImageUrl={importedImageById[candidate.id]?.url ?? candidate.createdArtist?.featuredAsset?.url ?? null}
                      image={importedImageById[candidate.id] ?? candidate.image ?? null}
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
                      const { score, missing } = computeArtistCompleteness(candidate);
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
                  <td className="px-3 py-2">
                    {candidate.eventLinks.length > 0 ? (
                      <button
                        type="button"
                        className="text-sm underline text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setExpandedEventLinks((prev) => ({
                            ...prev,
                            [candidate.id]: !prev[candidate.id],
                          }))
                        }
                      >
                        {candidate.eventLinks.length} event
                        {candidate.eventLinks.length === 1 ? "" : "s"}
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="min-w-[260px] px-3 py-2">
                    {(() => {
                      const approval = getApprovalState(candidate);
                      const image = getPersistedImageStatusLabel(candidate.imageImportStatus);
                      const approvalError = approval.detail ? truncateWithTitle(approval.detail, 100) : null;
                      const imageWarning = candidate.imageImportWarning
                        ? truncateWithTitle(candidate.imageImportWarning, 100)
                        : null;
                      return (
                        <div className="space-y-1 text-xs leading-tight">
                          <p className={getStatusToneClass(approval.tone)}>{approval.label}</p>
                          <p className={getStatusToneClass(image.tone)}>{image.label}</p>
                          {approvalError ? (
                            <p className="text-amber-700" title={approvalError.title ?? undefined}>
                              {approvalError.text}
                            </p>
                          ) : null}
                          {imageWarning ? (
                            <p className="text-muted-foreground" title={imageWarning.title ?? undefined}>
                              {imageWarning.text}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button data-action="approve" size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approve(candidate.id)}>Approve</Button>
                      {userRole === "ADMIN" ? (
                        <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approveAndPublish(candidate.id)}>Approve & Publish</Button>
                      ) : null}
                      <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => toggleEdit(candidate)}>
                        {editOpenById[candidate.id] ? "Close edit" : "Edit"}
                      </Button>
                      <Button data-action="reject" size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => reject(candidate.id)}>Reject</Button>
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
                {expandedEventLinks[candidate.id] && candidate.eventLinks.length > 0 ? (
                  <tr className="border-b bg-muted/20">
                    <td colSpan={11} className="px-4 py-2">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Events featuring this artist
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.eventLinks.map((link) => (
                          <a
                            key={link.eventId}
                            href={`/admin/events/${link.eventId}`}
                            className="rounded bg-muted px-2 py-1 text-xs hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {link.event.venue?.name ? `${link.event.venue.name} · ` : ""}
                            {link.event.title}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {editOpenById[candidate.id] ? (
                  <tr className="border-b">
                    <td colSpan={11} className="px-3 pb-3">
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
            {filteredCandidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={11}>No artist candidates match the active filters.</td>
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
