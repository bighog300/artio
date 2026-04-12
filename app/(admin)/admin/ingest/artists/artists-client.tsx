"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
import { Button } from "@/components/ui/button";
import { computeArtistCompleteness } from "@/lib/artist-completeness";
import { enqueueToast } from "@/lib/toast";

type Candidate = {
  id: string;
  name: string;
  normalizedName: string;
  bio: string | null;
  mediums: string[];
  collections: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
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
  identity?: {
    confidenceBand: string;
    observations: Array<{
      sourceDomain: string;
      confidenceScore: number;
      extractedAt: string | Date;
    }>;
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

type EditState = {
  name: string;
  bio: string;
  mediums: string;
  collections: string;
  nationality: string;
  birthYear: string;
  websiteUrl: string;
  instagramUrl: string;
  twitterUrl: string;
};

type ApprovalFilter = "all" | "failed" | "attempted" | "not_attempted";
type ImageFilter = "all" | "failed" | "no_image_found" | "imported" | "not_attempted";
type QueueSort = "updated_desc" | "approval_attempt_desc";

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


export default function ArtistsClient({
  candidates: initial,
  userRole,
  initialApprovalFilter = "all",
  initialImageFilter = "all",
  initialReasonCodeFilter = "",
  initialSort = "updated_desc",
}: {
  candidates: Candidate[];
  userRole?: "USER" | "EDITOR" | "ADMIN";
  initialApprovalFilter?: ApprovalFilter;
  initialImageFilter?: ImageFilter;
  initialReasonCodeFilter?: string;
  initialSort?: QueueSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [candidates, setCandidates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
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
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>(initialApprovalFilter);
  const [imageFilter, setImageFilter] = useState<ImageFilter>(initialImageFilter);
  const [reasonCodeFilter, setReasonCodeFilter] = useState(initialReasonCodeFilter);
  const [sort, setSort] = useState<QueueSort>(initialSort);

  const pushFilterState = useCallback(
    (nextApproval: ApprovalFilter, nextImage: ImageFilter, nextReason: string, nextSort: QueueSort) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextApproval === "all") params.delete("approval");
      else params.set("approval", nextApproval);
      if (nextImage === "all") params.delete("image");
      else params.set("image", nextImage);
      if (nextReason.trim()) params.set("reason", nextReason.trim());
      else params.delete("reason");
      if (nextSort === "updated_desc") params.delete("sort");
      else params.set("sort", nextSort);
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setCandidates(initial);
    setApprovalFilter(initialApprovalFilter);
    setImageFilter(initialImageFilter);
    setReasonCodeFilter(initialReasonCodeFilter);
    setSort(initialSort);
  }, [initial, initialApprovalFilter, initialImageFilter, initialReasonCodeFilter, initialSort]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      pushFilterState(approvalFilter, imageFilter, reasonCodeFilter, sort);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [approvalFilter, imageFilter, reasonCodeFilter, pushFilterState, sort]);

  function openEdit(candidate: (typeof candidates)[number]) {
    setEditingId(candidate.id);
    setEditState({
      name: candidate.name ?? "",
      bio: candidate.bio ?? "",
      mediums: (candidate.mediums ?? []).join(", "),
      collections: (candidate.collections ?? []).join(", "),
      nationality: candidate.nationality ?? "",
      birthYear: candidate.birthYear ? String(candidate.birthYear) : "",
      websiteUrl: candidate.websiteUrl ?? "",
      instagramUrl: candidate.instagramUrl ?? "",
      twitterUrl: candidate.twitterUrl ?? "",
    });
  }

  async function saveEdit(candidateId: string) {
    if (!editState) return;
    setSavingId(candidateId);
    try {
      const res = await fetch(`/api/admin/ingest/artists/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editState.name.trim() || undefined,
          bio: editState.bio.trim() || null,
          mediums: editState.mediums
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          collections: editState.collections
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          nationality: editState.nationality.trim() || null,
          birthYear: editState.birthYear
            ? Number.parseInt(editState.birthYear, 10)
            : null,
          websiteUrl: editState.websiteUrl.trim() || null,
          instagramUrl: editState.instagramUrl.trim() || null,
          twitterUrl: editState.twitterUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json() as {
        name: string;
        bio: string | null;
        mediums: string[];
        collections: string[];
        nationality: string | null;
        birthYear: number | null;
        websiteUrl: string | null;
        instagramUrl: string | null;
        twitterUrl: string | null;
      };

      setCandidates((prev) =>
        prev.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                name: updated.name,
                bio: updated.bio,
                mediums: updated.mediums,
                collections: updated.collections,
                nationality: updated.nationality,
                birthYear: updated.birthYear,
                websiteUrl: updated.websiteUrl,
                instagramUrl: updated.instagramUrl,
                twitterUrl: updated.twitterUrl,
              }
            : candidate,
        ),
      );

      setEditingId(null);
      setEditState(null);
      enqueueToast({ title: "Candidate updated", variant: "success" });
    } catch {
      enqueueToast({ title: "Failed to save changes", variant: "error" });
    } finally {
      setSavingId(null);
    }
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
      (candidate) => candidate.confidenceBand === "HIGH" && candidate.status === "PENDING",
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

    for (let index = 0; index < highCandidates.length; index += BATCH_SIZE) {
      const batch = highCandidates.slice(index, index + BATCH_SIZE);
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
      prev.filter((candidate) => !(candidate.confidenceBand === "HIGH" && candidate.status === "PENDING")),
    );
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
      const res = await fetch(`/api/admin/ingest/artists/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
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
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as QueueSort)}
              className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="updated_desc">Recently updated</option>
              <option value="approval_attempt_desc">Recent approval attempts</option>
            </select>
          </label>
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
                  <td className="px-3 py-2 font-medium">
                    {editingId === candidate.id && editState ? editState.name : candidate.name}
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    {editingId === candidate.id && editState
                      ? (editState.bio || "—")
                      : candidate.bio ? `${candidate.bio.slice(0, 100)}${candidate.bio.length > 100 ? "…" : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-2">
                      <div>
                        {editingId === candidate.id && editState
                          ? (editState.mediums || "—")
                          : candidate.mediums.length > 0 ? candidate.mediums.join(", ") : "—"}
                      </div>
                      {candidate.collections?.length > 0 ? (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collections</div>
                          <div className="flex flex-wrap gap-1">
                            {candidate.collections.map((collection) => (
                              <span key={collection} className="rounded bg-muted px-2 py-0.5 text-xs">
                                {collection}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {candidate.identity?.observations.length ? (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Known from {candidate.identity.observations.length} source{candidate.identity.observations.length > 1 ? "s" : ""}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {candidate.identity.observations.map((observation) => (
                              <span key={observation.sourceDomain} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
                                {observation.sourceDomain}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </td>
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
                      {candidate.status === "PENDING" && editingId !== candidate.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(candidate)}
                        >
                          Edit
                        </Button>
                      ) : null}
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
                {editingId === candidate.id && editState ? (
                  <tr className="border-b">
                    <td colSpan={11} className="px-3 pb-3">
                      <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Editing candidate
                        </div>

                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Name</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.name}
                              onChange={(event) => setEditState((state) => state ? { ...state, name: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Nationality</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.nationality}
                              onChange={(event) => setEditState((state) => state ? { ...state, nationality: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs md:col-span-2">
                            <span className="font-medium">Bio</span>
                            <textarea
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              rows={3}
                              value={editState.bio}
                              onChange={(event) => setEditState((state) => state ? { ...state, bio: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Mediums <span className="text-muted-foreground">(comma-separated)</span></span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.mediums}
                              onChange={(event) => setEditState((state) => state ? { ...state, mediums: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Collections <span className="text-muted-foreground">(comma-separated)</span></span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.collections}
                              onChange={(event) => setEditState((state) => state ? { ...state, collections: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Birth year</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              type="number"
                              min={1800}
                              max={2100}
                              value={editState.birthYear}
                              onChange={(event) => setEditState((state) => state ? { ...state, birthYear: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Website URL</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.websiteUrl}
                              onChange={(event) => setEditState((state) => state ? { ...state, websiteUrl: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Instagram URL</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.instagramUrl}
                              onChange={(event) => setEditState((state) => state ? { ...state, instagramUrl: event.target.value } : state)}
                            />
                          </label>

                          <label className="space-y-1 text-xs">
                            <span className="font-medium">Twitter / X URL</span>
                            <input
                              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                              value={editState.twitterUrl}
                              onChange={(event) => setEditState((state) => state ? { ...state, twitterUrl: event.target.value } : state)}
                            />
                          </label>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingId === candidate.id}
                            onClick={() => void saveEdit(candidate.id)}
                          >
                            {savingId === candidate.id ? "Saving…" : "Save changes"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditingId(null); setEditState(null); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}             </Fragment>
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
