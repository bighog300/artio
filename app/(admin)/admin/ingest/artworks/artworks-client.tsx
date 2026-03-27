"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
import { Button } from "@/components/ui/button";
import { resolveRelativeHttpUrl } from "@/lib/ingest/url-utils";

type Candidate = {
  id: string;
  title: string;
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  description: string | null;
  imageUrl: string | null;
  artistName: string | null;
  artistStatus: "exists" | "pending" | "stub" | null;
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
  createdArtworkId: string | null;
  sourceEvent: { id: string; title: string; slug: string } | null;
  createdArtwork?: {
    id: string;
    artistId: string;
    artist: { id: string; name: string; slug: string; status: string } | null;
  } | null;
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

function truncateWithTitle(value: string, max = 90): { text: string; title?: string } {
  if (value.length <= max) return { text: value };
  return { text: `${value.slice(0, max - 1)}…`, title: value };
}

function getStatusToneClass(tone: "muted" | "ok" | "warn"): string {
  if (tone === "ok") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  return "text-muted-foreground";
}

function getApprovalState(candidate: Candidate): { tone: "muted" | "ok" | "warn"; label: string; detail?: string } {
  if (!candidate.lastApprovalAttemptAt) return { tone: "muted", label: "Approval: Not attempted" };
  if (candidate.lastApprovalError) {
    const at = formatCompactTimestamp(candidate.lastApprovalAttemptAt);
    return {
      tone: "warn",
      label: at ? `Approval failed (${at})` : "Approval failed",
      detail: candidate.lastApprovalError,
    };
  }
  const at = formatCompactTimestamp(candidate.lastApprovalAttemptAt);
  return { tone: "ok", label: at ? `Approval attempted (${at})` : "Approval attempted" };
}

function getImageStatusState(status: string | null): { tone: "muted" | "ok" | "warn"; label: string } {
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

type EditDraft = {
  title: string;
  artistName: string;
  medium: string;
  year: string;
  dimensions: string;
  description: string;
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

export default function ArtworksClient({
  candidates: initial,
  userRole,
}: {
  candidates: Candidate[];
  userRole?: "USER" | "EDITOR" | "ADMIN";
}) {
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [mergeOpenById, setMergeOpenById] = useState<Record<string, boolean>>({});
  const [mergeQueryById, setMergeQueryById] = useState<Record<string, string>>({});
  const [mergeOptionsById, setMergeOptionsById] = useState<Record<string, Array<{ id: string; title: string; slug: string; artistName: string }>>>({});
  const [editOpenById, setEditOpenById] = useState<Record<string, boolean>>({});
  const [editDraftById, setEditDraftById] = useState<Record<string, EditDraft>>({});
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [importingImageFor, setImportingImageFor] = useState<string | null>(null);
  const [importedImageFor, setImportedImageFor] = useState<Set<string>>(new Set());
  const [importFailedFor, setImportFailedFor] = useState<Set<string>>(new Set());
  const [importedImageById, setImportedImageById] = useState<Record<string, { url: string | null; isProcessing?: boolean; hasFailure?: boolean }>>({});
  const [imageImportMessageById, setImageImportMessageById] = useState<Record<string, string>>({});
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ approved: number; failed: number } | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [reasonCodeFilter, setReasonCodeFilter] = useState("");

  function applyImageImportOutcome(candidateId: string, body: {
    imageImported?: boolean;
    image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
    imageImportWarning?: string | null;
    warning?: string | null;
  }, markFailureWhenNotImported = true) {
    const warning = body.imageImportWarning ?? body.warning ?? null;
    if (body.imageImported) {
      setImportedImageFor((prev) => new Set([...prev, candidateId]));
      setImportFailedFor((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      if (body.image?.url) {
        setImportedImageById((prev) => ({ ...prev, [candidateId]: body.image! }));
      }
      setImageImportMessageById((prev) => ({ ...prev, [candidateId]: "Image imported." }));
      return;
    }
    if (markFailureWhenNotImported) {
      setImportFailedFor((prev) => new Set([...prev, candidateId]));
    }
    if (warning) {
      setImageImportMessageById((prev) => ({ ...prev, [candidateId]: warning }));
      return;
    }
    setImageImportMessageById((prev) => ({ ...prev, [candidateId]: "Image import did not run." }));
  }

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

  function openEdit(candidate: Candidate) {
    setEditOpenById((prev) => ({ ...prev, [candidate.id]: true }));
    setEditDraftById((prev) => ({
      ...prev,
      [candidate.id]: {
        title: candidate.title,
        artistName: candidate.artistName ?? "",
        medium: candidate.medium ?? "",
        year: candidate.year != null ? String(candidate.year) : "",
        dimensions: candidate.dimensions ?? "",
        description: candidate.description ?? "",
      },
    }));
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

  async function importArtworkImage(candidateId: string) {
    setImportingImageFor(candidateId);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${candidateId}/import-image`, {
        method: "POST",
      });
      if (res.ok) {
        const body = await res.json() as {
          attached?: boolean;
          image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
          warning?: string | null;
        };
        applyImageImportOutcome(candidateId, {
          imageImported: body.attached,
          image: body.image,
          warning: body.warning,
        }, false);
        if (body.image) {
          setImportedImageById((prev) => ({ ...prev, [candidateId]: body.image! }));
        }
      } else {
        setImportFailedFor((prev) => new Set([...prev, candidateId]));
      }
    } catch {
      setImportFailedFor((prev) => new Set([...prev, candidateId]));
    } finally {
      setImportingImageFor(null);
    }
  }

  const merge = useCallback(async (id: string, existingArtworkId: string) => {
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
      const body = await res.json() as {
        artworkId?: string;
        artistId?: string;
        imageImported?: boolean;
        image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
        imageImportWarning?: string | null;
      };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtworkId: body.artworkId ?? item.createdArtworkId, createdArtwork: body.artworkId ? { id: body.artworkId, artistId: body.artistId ?? item.createdArtwork?.artistId ?? "", artist: item.createdArtwork?.artist ?? null } : item.createdArtwork } : item));
      if (body.artworkId) {
        applyImageImportOutcome(id, body);
      }
      setFocusedIndex(null);
    } catch {
      setError("Failed to link artwork candidate to existing artwork.");
    } finally {
      setWorkingId(null);
    }
  }, []);

  const approve = useCallback(async (id: string) => {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to approve artwork candidate due to an unexpected server error.");
        return;
      }
      const body = await res.json() as {
        artworkId?: string;
        artistId?: string;
        imageImported?: boolean;
        image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
        imageImportWarning?: string | null;
      };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtworkId: body.artworkId ?? item.createdArtworkId, createdArtwork: body.artworkId ? { id: body.artworkId, artistId: body.artistId ?? item.createdArtwork?.artistId ?? "", artist: item.createdArtwork?.artist ?? null } : item.createdArtwork } : item));
      if (body.artworkId) {
        applyImageImportOutcome(id, body);
      }
      setFocusedIndex(null);
    } catch {
      setError("Failed to approve artwork candidate.");
    } finally {
      setWorkingId(null);
    }
  }, []);

  async function bulkApproveHigh() {
    const highCandidates = candidates.filter(
      (candidate) => candidate.confidenceBand === "HIGH" && candidate.status === "PENDING",
    );
    if (highCandidates.length === 0) return;
    if (
      !window.confirm(
        `Approve all ${highCandidates.length} HIGH ` +
          `confidence artwork candidate` +
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

    for (let index = 0; index < highCandidates.length; index += BATCH_SIZE) {
      const batch = highCandidates.slice(index, index + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((candidate) =>
          fetch(`/api/admin/ingest/artworks/${candidate.id}/approve`, { method: "POST" })
            .then((response) => (response.ok ? ("ok" as const) : ("fail" as const)))
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
      prev.filter((candidate) => !(candidate.confidenceBand === "HIGH" && candidate.status === "PENDING")),
    );
  }

  async function approveWithPatch(id: string) {
    const draft = editDraftById[id];
    if (!draft) {
      await approve(id);
      return;
    }

    const year = draft.year ? Number.parseInt(draft.year, 10) : null;
    const payload = {
      ...(draft.title ? { title: draft.title } : {}),
      ...(draft.artistName ? { artistName: draft.artistName } : {}),
      ...(draft.medium ? { medium: draft.medium } : {}),
      ...(Number.isFinite(year) ? { year } : {}),
      ...(draft.dimensions ? { dimensions: draft.dimensions } : {}),
      ...(draft.description ? { description: draft.description } : {}),
    };

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
      const body = await res.json() as {
        artworkId?: string;
        artistId?: string;
        imageImported?: boolean;
        image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
        imageImportWarning?: string | null;
      };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtworkId: body.artworkId ?? item.createdArtworkId, createdArtwork: body.artworkId ? { id: body.artworkId, artistId: body.artistId ?? item.createdArtwork?.artistId ?? "", artist: item.createdArtwork?.artist ?? null } : item.createdArtwork } : item));
      if (body.artworkId) {
        applyImageImportOutcome(id, body);
      }
    } catch {
      setError("Failed to approve artwork candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  async function approveAndPublish(id: string) {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishImmediately: true }),
      });
      if (!res.ok) {
        setError("Failed to approve and publish artwork candidate.");
        return;
      }
      const body = await res.json() as {
        artworkId?: string;
        artistId?: string;
        imageImported?: boolean;
        image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
        imageImportWarning?: string | null;
      };
      setCandidates((prev) => prev.map((item) => item.id === id ? { ...item, status: "APPROVED", createdArtworkId: body.artworkId ?? item.createdArtworkId, createdArtwork: body.artworkId ? { id: body.artworkId, artistId: body.artistId ?? item.createdArtwork?.artistId ?? "", artist: item.createdArtwork?.artist ?? null } : item.createdArtwork } : item));
      if (body.artworkId) {
        applyImageImportOutcome(id, body);
      }
    } catch {
      setError("Failed to approve and publish artwork candidate.");
    } finally {
      setWorkingId(null);
    }
  }

  const reject = useCallback(async (id: string) => {
    setWorkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/artworks/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to reject artwork candidate.");
        return;
      }
      setCandidates((prev) => prev.filter((item) => item.id !== id));
      setFocusedIndex(null);
    } catch {
      setError("Failed to reject artwork candidate.");
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
            (candidate) => candidate.confidenceBand === "HIGH" && candidate.status === "PENDING",
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
              Dismiss
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
        <table className="w-full min-w-[1480px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">img</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Artist</th>
              <th className="px-3 py-2">Medium</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Source event</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Observability</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((candidate) => {
              const resolvedImageUrl =
                resolveRelativeHttpUrl(candidate.imageUrl, candidate.sourceUrl) ?? candidate.imageUrl;
              const sourceEventTitle = candidate.sourceEvent?.title?.trim() || "Unknown event";
              const sourceEventSlug = candidate.sourceEvent?.slug?.trim() || null;

              return (
                <Fragment key={candidate.id}>
                <tr
                  data-candidate-id={candidate.id}
                  className={`border-b align-top ${focusedCandidateId === candidate.id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/20 dark:ring-blue-800" : ""}`}
                >
                  <td className="px-3 py-2">
                    <IngestImageCell
                      imageUrl={resolvedImageUrl}
                      blobImageUrl={importedImageById[candidate.id]?.url ?? null}
                      image={importedImageById[candidate.id] ?? null}
                      altText={candidate.title}
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
                        candidate.createdArtworkId
                          ? () => importArtworkImage(candidate.id)
                          : undefined
                      }
                    />
                    {imageImportMessageById[candidate.id] ? (
                      <p className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{imageImportMessageById[candidate.id]}</p>
                    ) : null}
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
                  <td className="px-3 py-2">
                    {candidate.artistName ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{candidate.artistName}</span>
                        {candidate.artistStatus === "exists" ? (
                          <span className="text-xs text-emerald-700">✓ artist exists</span>
                        ) : candidate.artistStatus === "pending" ? (
                          <span className="text-xs text-amber-700">⟳ in artist queue</span>
                        ) : candidate.artistStatus === "stub" ? (
                          <span className="text-xs text-muted-foreground">+ will create stub</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{candidate.medium ?? "—"}</td>
                  <td className="px-3 py-2">{candidate.year ?? "—"}</td>
                  <td className="px-3 py-2">
                    {sourceEventSlug ? (
                      <Link className="underline" href={`/events/${sourceEventSlug}`}>{sourceEventTitle}</Link>
                    ) : (
                      <span>{sourceEventTitle}</span>
                    )}
                    {candidate.createdArtworkId ? (
                      <p className="text-xs text-muted-foreground">
                        Artist:{" "}
                        {candidate.createdArtwork?.artist ? (
                          <Link
                            href={`/admin/artists/${candidate.createdArtwork.artist.id}`}
                            className="underline"
                          >
                            {candidate.createdArtwork.artist.name}
                          </Link>
                        ) : (
                          <span className="text-amber-600">not linked</span>
                        )}
                        {candidate.createdArtwork?.artist?.status === "IN_REVIEW" ? (
                          <span className="ml-1 text-amber-600">(stub — awaiting artist approval)</span>
                        ) : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{candidate.extractionProvider}</td>
                  <td className="min-w-[250px] px-3 py-2">
                    {(() => {
                      const approval = getApprovalState(candidate);
                      const image = getImageStatusState(candidate.imageImportStatus);
                      const approvalError = approval.detail ? truncateWithTitle(approval.detail) : null;
                      const imageWarning = candidate.imageImportWarning
                        ? truncateWithTitle(candidate.imageImportWarning)
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
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button data-action="approve" className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approve(candidate.id)}>Approve</button>
                        {userRole === "ADMIN" ? (
                          <button className="rounded border border-emerald-600 px-2 py-1 text-xs text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approveAndPublish(candidate.id)}>Approve & Publish</button>
                        ) : null}
                        <button data-action="reject" className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => reject(candidate.id)}>Reject</button>
                        <button
                          className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={workingId === candidate.id || candidate.status !== "PENDING"}
                          onClick={() => openEdit(candidate)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={workingId === candidate.id || candidate.status !== "PENDING"}
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
                      {candidate.artistStatus === "pending" ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Artist candidate not yet reviewed —{" "}
                          <a href="/admin/ingest/artists" className="underline">
                            review artists first
                          </a>
                        </p>
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
                            className={`rounded border px-2 py-1 text-sm ${candidate.artistName == null ? "border-amber-400" : ""}`}
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
                        {userRole === "ADMIN" ? (
                          <Button size="sm" variant="outline" disabled={workingId === candidate.id || candidate.status !== "PENDING"} onClick={() => approveAndPublish(candidate.id)}>
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
              );
            })}
            {filteredCandidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={10}>No artwork candidates match the active filters.</td>
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
