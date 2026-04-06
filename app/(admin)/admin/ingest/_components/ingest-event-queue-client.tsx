"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import IngestCandidateActions from "@/app/(admin)/admin/ingest/_components/ingest-candidate-actions";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBulkAction } from "@/app/(admin)/admin/ingest/_hooks/use-bulk-action";

const KEYBOARD_SHORTCUTS = [
  { key: "J / K", label: "navigate" },
  { key: "A", label: "approve" },
  { key: "R", label: "reject" },
  { key: "S", label: "skip" },
] as const;

type QueueCandidate = {
  id: string;
  title: string;
  imageUrl: string | null;
  blobImageUrl: string | null;
  startAt: Date | null;
  locationText: string | null;
  description: string | null;
  artistNames: string[];
  timezone: string | null;
  confidenceScore: number;
  confidenceBand: string | null;
  confidenceReasons: unknown;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";
  rejectionReason: string | null;
  createdEventId: string | null;
  venue: { id: string; name: string };
  run: { id: string; sourceUrl: string };
};

function getConfidenceBand(value: string | null): "HIGH" | "MEDIUM" | "LOW" {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return "LOW";
}

function getConfidenceReasons(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const reasons = value.filter(
    (item): item is string => typeof item === "string",
  );
  return reasons.length > 0 ? reasons : null;
}
export default function IngestEventQueueClient({
  candidates: initialCandidates,
  totalPending,
  digestSummary,
  venues = [],
  userRole,
  nextCursor,
  hasMore = false,
}: {
  candidates: QueueCandidate[];
  totalPending?: number;
  digestSummary?: string;
  venues?: Array<{ id: string; name: string }>;
  userRole?: "USER" | "EDITOR" | "ADMIN";
  nextCursor?: string | null;
  hasMore?: boolean;
}) {
  const router = useRouter();
  const [showReasons, setShowReasons] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<
    Record<string, {
      title: string;
      description: string;
      startAt: string;
      endAt: string;
      timezone: string;
      locationText: string;
    }>
  >({});
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<
    "all" | "HIGH" | "MEDIUM" | "LOW"
  >("all");
  const [importingImageFor, setImportingImageFor] = useState<string | null>(
    null,
  );
  const [importedImageFor, setImportedImageFor] = useState<Set<string>>(
    new Set(),
  );
  const [importFailedFor, setImportFailedFor] = useState<Set<string>>(new Set());
  const [importImageError, setImportImageError] = useState<string | null>(null);
  const [pipelineStatusById, setPipelineStatusById] = useState<
    Record<string, {
      linked: boolean;
      linkedArtists: Array<{ id: string; name: string; slug: string }>;
      artistCandidates: Array<{ id: string; name: string; status: string }>;
      artworkCandidates: Array<{
        id: string;
        title: string;
        status: string;
        imageUrl: string | null;
      }>;
      imageStatus: { attached: boolean; url: string | null };
    }>
  >({});
  const [loadingPipelineFor, setLoadingPipelineFor] = useState<Set<string>>(
    new Set(),
  );
  const [bulkRejectReason, setBulkRejectReason] = useState("Navigation noise");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditDraft, setBulkEditDraft] = useState<{
    timezone: string;
    rejectionReason: string;
  }>({ timezone: "", rejectionReason: "" });
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<QueueCandidate[]>(initialCandidates);

  function initDraft(candidate: QueueCandidate) {
    const candidateEndAt =
      "endAt" in candidate ? (candidate.endAt as Date | null | undefined) : null;

    return {
      title: candidate.title,
      description: candidate.description ?? "",
      startAt: candidate.startAt
        ? new Date(candidate.startAt).toISOString().slice(0, 16)
        : "",
      endAt: candidateEndAt
        ? new Date(candidateEndAt).toISOString().slice(0, 16)
        : "",
      timezone: candidate.timezone ?? "",
      locationText: candidate.locationText ?? "",
    };
  }

  const filteredCandidates = candidates
    .filter((candidate) => venueFilter === "all" || candidate.venue.id === venueFilter)
    .filter(
      (candidate) =>
        confidenceFilter === "all" || candidate.confidenceBand === confidenceFilter,
    )
    .sort((a, b) => {
      const aSkipped = skippedIds.has(a.id) ? 1 : 0;
      const bSkipped = skippedIds.has(b.id) ? 1 : 0;
      return aSkipped - bSkipped;
    });

  useEffect(() => {
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  async function importImage(
    candidateId: string,
    runId: string,
    imageUrl: string,
    setAsFeatured: boolean,
  ) {
    setImportingImageFor(candidateId);
    setImportImageError(null);
    try {
      const res = await fetch(
        `/api/admin/ingest/runs/${runId}/import-venue-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, setAsFeatured }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setImportFailedFor((prev) => new Set([...prev, candidateId]));
        setImportImageError(body.error?.message ?? "Import failed.");
        return;
      }
      setImportedImageFor((prev) => new Set([...prev, candidateId]));
      setImportFailedFor((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    } catch {
      setImportFailedFor((prev) => new Set([...prev, candidateId]));
      setImportImageError("Import failed.");
    } finally {
      setImportingImageFor(null);
    }
  }

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pipelineErrorById, setPipelineErrorById] = useState<Record<string, boolean>>({});
  const [bulkRejectConfirmOpen, setBulkRejectConfirmOpen] = useState(false);

  const highCandidates = useMemo(
    () => filteredCandidates.filter((c) => c.confidenceBand === "HIGH" && c.status === "PENDING"),
    [filteredCandidates],
  );
  const lowCandidates = useMemo(
    () => candidates.filter((c) => c.confidenceBand === "LOW" && c.status === "PENDING"),
    [candidates],
  );
  const selectedMediumIds = useMemo(() => [...selectedIds], [selectedIds]);

  const bulkApproveAction = useBulkAction(
    highCandidates,
    async (candidate) => {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidate.id}/approve`, {
        method: "POST",
      }).catch(() => null);
      return res?.ok ? "ok" : "fail";
    },
  );

  const bulkRejectAction = useBulkAction(
    lowCandidates,
    async (candidate) => {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidate.id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rejectionReason: bulkRejectReason }),
      }).catch(() => null);
      return res?.ok ? "ok" : "fail";
    },
  );

  const bulkEditAction = useBulkAction(
    selectedMediumIds,
    async (id) => {
      const patch: Record<string, string> = {};
      if (bulkEditDraft.timezone.trim()) {
        patch.timezone = bulkEditDraft.timezone.trim();
      }
      if (!Object.keys(patch).length) return "fail";

      const res = await fetch(`/api/admin/ingest/extracted-events/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      return res?.ok ? "ok" : "fail";
    },
  );

  async function bulkApproveHigh() {
    await bulkApproveAction.run();
    router.refresh();
  }

  async function bulkRejectLow() {
    await bulkRejectAction.run();
    router.refresh();
  }

  async function applyBulkEdit() {
    const patchValue = bulkEditDraft.timezone.trim();
    if (!patchValue || selectedIds.size === 0) return;

    await bulkEditAction.run();

    setCandidates((prev) =>
      prev.map((c) =>
        selectedIds.has(c.id)
          ? { ...c, timezone: patchValue }
          : c,
      ),
    );

    setSelectedIds(new Set());
    setBulkEditOpen(false);
    setBulkEditDraft({ timezone: "", rejectionReason: "" });
  }

  function goToNextPage() {
    if (!nextCursor) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", nextCursor);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const visibleMed = filteredCandidates.filter(
      (c) => c.confidenceBand === "MEDIUM" && c.status === "PENDING",
    );
    setSelectedIds(new Set(visibleMed.map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function fetchPipelineStatus(candidateId: string) {
    if (loadingPipelineFor.has(candidateId) || pipelineStatusById[candidateId]) return;

    setPipelineErrorById((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });
    setLoadingPipelineFor((prev) => new Set([...prev, candidateId]));

    try {
      const res = await fetch(
        `/api/admin/ingest/extracted-events/${candidateId}/pipeline-status`,
      );
      if (!res.ok) {
        setPipelineErrorById((prev) => ({ ...prev, [candidateId]: true }));
        return;
      }

      const data = (await res.json()) as {
        linked: boolean;
        linkedArtists: Array<{ id: string; name: string; slug: string }>;
        artistCandidates: Array<{ id: string; name: string; status: string }>;
        artworkCandidates: Array<{
          id: string;
          title: string;
          status: string;
          imageUrl: string | null;
        }>;
        imageStatus: { attached: boolean; url: string | null };
      };
      setPipelineStatusById((prev) => ({ ...prev, [candidateId]: data }));
    } catch {
      setPipelineErrorById((prev) => ({ ...prev, [candidateId]: true }));
    } finally {
      setLoadingPipelineFor((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  }

  useEffect(() => {
    const approved = candidates.filter(
      (c) => c.createdEventId && !pipelineStatusById[c.id],
    );
    const toFetch = approved.slice(0, 10);
    for (const c of toFetch) {
      void fetchPipelineStatus(c.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

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
      } else if (e.key === "s" || e.key === "S") {
        if (focusedIndex === null) return;
        const candidate = pending[focusedIndex];
        if (!candidate) return;
        e.preventDefault();
        setSkippedIds((prev) => new Set([...prev, candidate.id]));
        setFocusedIndex((prev) =>
          prev === null ? null : Math.min(prev, pending.length - 2),
        );
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
      {digestSummary ? (
        <p className="mb-3 text-sm text-muted-foreground">{digestSummary}</p>
      ) : null}
      <div className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Pending candidates</h2>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
            >
              <option value="all">All venues ({candidates.length})</option>
              {venues.map((venue) => {
                const count = candidates.filter(
                  (c) =>
                    c.venue.id === venue.id &&
                    (confidenceFilter === "all" ||
                      c.confidenceBand === confidenceFilter),
                ).length;
                if (count === 0) return null;
                return (
                  <option key={venue.id} value={venue.id}>
                    {venue.name} ({count})
                  </option>
                );
              })}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={confidenceFilter}
              onChange={(e) =>
                setConfidenceFilter(
                  e.target.value as "all" | "HIGH" | "MEDIUM" | "LOW",
                )
              }
            >
              <option value="all">All confidence</option>
              <option value="HIGH">HIGH only</option>
              <option value="MEDIUM">MEDIUM only</option>
              <option value="LOW">LOW only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {venueFilter === "all"
                ? "Showing currently loaded pending candidates from all venues."
                : `Showing ${filteredCandidates.length} pending candidate${filteredCandidates.length === 1 ? "" : "s"} for this venue.`}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showReasons}
                onChange={(e) => setShowReasons(e.target.checked)}
              />
              Show confidence reasons
            </label>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto hidden text-xs text-muted-foreground sm:block">
            {KEYBOARD_SHORTCUTS.map((shortcut) => `${shortcut.key} ${shortcut.label}`).join(" · ")}
          </span>
          {(() => {
            const highCount = filteredCandidates.filter(
              (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
            ).length;
            if (highCount === 0) return null;
            return (
              <button
                type="button"
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                disabled={bulkApproveAction.running}
                onClick={() => {
                  if (!window.confirm(`Approve all ${highCount} HIGH confidence candidate${highCount === 1 ? "" : "s"}? This cannot be undone.`)) return;
                  void bulkApproveHigh();
                }}
              >
                {bulkApproveAction.running
                  ? `Approving… ${bulkApproveAction.progress?.done ?? 0}/${bulkApproveAction.progress?.total ?? highCount}`
                  : `Approve all HIGH (${highCount})`}
              </button>
            );
          })()}
          {(() => {
            const lowCount = candidates.filter(
              (c) => c.confidenceBand === "LOW" && c.status === "PENDING",
            ).length;
            if (lowCount === 0) return null;
            return (
              <div className="flex items-center gap-2">
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  disabled={bulkRejectAction.running}
                >
                  <option value="Navigation noise">Noise</option>
                  <option value="Not a real event">Not an event</option>
                  <option value="Private event">Private event</option>
                  <option value="Duplicate content">Duplicate</option>
                  <option value="Past event">Past event</option>
                </select>
                <button
                  type="button"
                  className="rounded border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  disabled={bulkRejectAction.running}
                  onClick={() => setBulkRejectConfirmOpen(true)}
                >
                  {bulkRejectAction.running
                    ? `Rejecting… ${bulkRejectAction.progress?.done ?? 0}/${bulkRejectAction.progress?.total ?? lowCount}`
                    : `Reject all LOW (${lowCount})`}
                </button>
              </div>
            );
          })()}
          {candidates.filter((c) => c.confidenceBand === "MEDIUM" && c.status === "PENDING").length >
          0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={selectAllVisible}
            >
              Select all MEDIUM (
              {
                candidates.filter(
                  (c) => c.confidenceBand === "MEDIUM" && c.status === "PENDING",
                ).length
              }
              )
            </button>
          ) : null}
        </div>
      </div>
      {(totalPending ?? 0) > candidates.length ? (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Showing {candidates.length} of {totalPending} pending candidates —
          scroll down to load more.
        </div>
      ) : null}
      {importImageError ? (
        <div className="mb-3 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
          <span>{importImageError}</span>
          <button
            type="button"
            className="text-amber-700"
            onClick={() => setImportImageError(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      {bulkApproveAction.results ? (
        <div
          className={`mb-3 flex items-center justify-between rounded border px-3 py-2 text-sm ${
            bulkApproveAction.results.failed > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
          }`}
        >
          <span>
            Bulk approve complete: {bulkApproveAction.results.succeeded} approved
            {bulkApproveAction.results.failed > 0 ? `, ${bulkApproveAction.results.failed} failed` : ""}
          </span>
          <button type="button" onClick={bulkApproveAction.clearResults}>
            ×
          </button>
        </div>
      ) : null}
      {bulkRejectAction.results ? (
        <div
          className={`mb-3 flex items-center justify-between rounded border px-3 py-2 text-sm ${
            bulkRejectAction.results.failed > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
          }`}
        >
          <span>
            Bulk reject complete: {bulkRejectAction.results.succeeded} rejected
            {bulkRejectAction.results.failed > 0 ? `, ${bulkRejectAction.results.failed} failed` : ""}
          </span>
          <button type="button" onClick={bulkRejectAction.clearResults}>
            ×
          </button>
        </div>
      ) : null}
      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-10 bg-background pb-2 pt-1">
          <div className="mb-3 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
            <span className="text-sm text-blue-800">{selectedIds.size} selected</span>
            <button
              type="button"
              className="text-sm text-blue-800 underline"
              onClick={() => setBulkEditOpen(true)}
            >
              Edit shared fields
            </button>
            <button
              type="button"
              className="ml-auto text-xs text-blue-600"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
      {bulkEditOpen ? (
        <div className="sticky top-0 z-10 bg-background pb-2">
          <div className="mb-3 space-y-3 rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Edit {selectedIds.size} selected event{selectedIds.size !== 1 ? "s" : ""}
              </h3>
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only non-empty fields will be applied. Leave blank to skip that field.
            </p>

            <label className="block space-y-1 text-sm">
              <span>Timezone (IANA)</span>
              <input
                className="w-full rounded border bg-background px-3 py-1.5 text-sm"
                placeholder="e.g. Europe/London"
                value={bulkEditDraft.timezone}
                onChange={(e) =>
                  setBulkEditDraft((prev) => ({ ...prev, timezone: e.target.value }))
                }
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
                disabled={bulkEditAction.running || !bulkEditDraft.timezone.trim()}
                onClick={() => void applyBulkEdit()}
              >
                {bulkEditAction.running ? "Applying…" : "Apply to selected"}
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm"
                onClick={() => setBulkEditOpen(false)}
              >
                Cancel
              </button>
            </div>

            {bulkEditAction.results ? (
              <p className="text-xs text-emerald-700">
                Updated {bulkEditAction.results.succeeded} events
                {bulkEditAction.results.failed > 0 ? `, ${bulkEditAction.results.failed} failed` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-2 py-2" />
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Image</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Start Date</th>
              <th className="px-3 py-2">Venue</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Pipeline</th>
              <th className="px-3 py-2">Run Source</th>
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
                  <td className="px-2 py-2">
                    {candidate.confidenceBand === "MEDIUM" ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(candidate.id)}
                        onChange={() => toggleSelected(candidate.id)}
                        disabled={candidate.status !== "PENDING"}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <IngestConfidenceBadge
                      score={candidate.confidenceScore}
                      band={getConfidenceBand(candidate.confidenceBand)}
                      reasons={getConfidenceReasons(candidate.confidenceReasons)}
                      showReasons={showReasons}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <IngestImageCell
                      imageUrl={candidate.imageUrl}
                      blobImageUrl={candidate.blobImageUrl}
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
                        candidate.imageUrl && candidate.status !== "DUPLICATE"
                          ? () =>
                              importImage(
                                candidate.id,
                                candidate.run.id,
                                candidate.imageUrl!,
                                true,
                              )
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => {
                        const next = expandedId === candidate.id ? null : candidate.id;
                        setExpandedId(next);
                        if (next && candidate.createdEventId) {
                          void fetchPipelineStatus(candidate.id);
                        }
                      }}
                    >
                      {candidate.title}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {candidate.startAt
                      ? new Date(candidate.startAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{candidate.venue.name}</td>
                  <td className="px-3 py-2">{candidate.locationText ?? "—"}</td>
                  <td className="px-3 py-2">
                    {candidate.createdEventId ? (
                      pipelineStatusById[candidate.id] ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span
                            title={
                              pipelineStatusById[candidate.id].imageStatus.attached
                                ? "Image attached"
                                : "No image"
                            }
                            className={
                              pipelineStatusById[candidate.id].imageStatus.attached
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }
                          >
                            {pipelineStatusById[candidate.id].imageStatus.attached
                              ? "✓ img"
                              : "○ img"}
                          </span>
                          {pipelineStatusById[candidate.id].linkedArtists.length > 0 ? (
                            <span className="text-emerald-600">
                              ✓ {pipelineStatusById[candidate.id].linkedArtists.length}{" "}
                              artist
                              {pipelineStatusById[candidate.id].linkedArtists.length ===
                              1
                                ? ""
                                : "s"}
                            </span>
                          ) : pipelineStatusById[candidate.id].artistCandidates
                              .length > 0 ? (
                            <span className="text-amber-600">
                              ⟳{" "}
                              {
                                pipelineStatusById[candidate.id].artistCandidates
                                  .length
                              }{" "}
                              queued
                            </span>
                          ) : null}
                          {pipelineStatusById[candidate.id].artworkCandidates.length >
                          0 ? (
                            <span className="text-muted-foreground">
                              {
                                pipelineStatusById[candidate.id].artworkCandidates
                                  .length
                              }{" "}
                              artwork
                              {pipelineStatusById[candidate.id].artworkCandidates
                                .length === 1
                                ? ""
                                : "s"}
                            </span>
                          ) : null}
                        </div>
                      ) : loadingPipelineFor.has(candidate.id) ? (
                        <span className="text-xs text-muted-foreground">…</span>
                      ) : pipelineErrorById[candidate.id] ? (
                        <button
                          type="button"
                          className="text-xs text-destructive underline"
                          onClick={() => {
                            setPipelineErrorById((prev) => {
                              const next = { ...prev };
                              delete next[candidate.id];
                              return next;
                            });
                            void fetchPipelineStatus(candidate.id);
                          }}
                        >
                          Retry ↺
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => void fetchPipelineStatus(candidate.id)}
                        >
                          load
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/admin/ingest/runs/${candidate.run.id}`}
                        className="text-xs underline"
                      >
                        Run details
                      </Link>
                      <a
                        href={candidate.run.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-[280px] truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                        title={candidate.run.sourceUrl}
                      >
                        ↗ {candidate.run.sourceUrl}
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <IngestCandidateActions
                      candidateId={candidate.id}
                      venueId={candidate.venue.id}
                      status={candidate.status}
                      createdEventId={candidate.createdEventId}
                      rejectionReason={candidate.rejectionReason}
                      userRole={userRole}
                      patch={
                        editDrafts[candidate.id]
                          ? {
                              title: editDrafts[candidate.id].title || undefined,
                              description: editDrafts[candidate.id].description || null,
                              startAt: editDrafts[candidate.id].startAt || null,
                              endAt: editDrafts[candidate.id].endAt || null,
                              timezone: editDrafts[candidate.id].timezone || null,
                              locationText: editDrafts[candidate.id].locationText || null,
                            }
                          : undefined
                      }
                      onSkip={() => {
                        setSkippedIds((prev) => new Set([...prev, candidate.id]));
                        setFocusedIndex(null);
                      }}
                    />
                  </td>
                </tr>
                {expandedId === candidate.id ? (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={10} className="px-4 py-3 text-sm">
                      <div className="space-y-2">
                        {candidate.artistNames.length > 0 ? (
                          <p>
                            <span className="font-medium text-foreground">
                              Artists:{" "}
                            </span>
                            <span className="text-muted-foreground">
                              {candidate.artistNames.join(", ")}
                            </span>
                          </p>
                        ) : null}
                        {candidate.description ? (
                          <p>
                            <span className="font-medium text-foreground">
                              Description:{" "}
                            </span>
                            <span className="text-muted-foreground">
                              {candidate.description}
                            </span>
                          </p>
                        ) : (
                          <p className="text-muted-foreground italic">
                            No description extracted.
                          </p>
                        )}
                        {candidate.timezone ? (
                          <p className="text-xs text-muted-foreground">
                            Timezone: {candidate.timezone}
                          </p>
                        ) : null}
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => {
                              if (editingId === candidate.id) {
                                setEditingId(null);
                              } else {
                                setEditingId(candidate.id);
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [candidate.id]: initDraft(candidate),
                                }));
                              }
                            }}
                          >
                            {editingId === candidate.id ? "Cancel edit" : "Edit before approval"}
                          </button>
                        </div>

                        {editingId === candidate.id ? (
                          <div className="mt-3 grid gap-3 rounded border bg-background p-3 text-sm sm:grid-cols-2">
                            {(
                              [
                                { key: "title", label: "Title", type: "text" },
                                { key: "locationText", label: "Location", type: "text" },
                                { key: "startAt", label: "Start at", type: "datetime-local" },
                                { key: "endAt", label: "End at", type: "datetime-local" },
                                { key: "timezone", label: "Timezone (IANA)", type: "text" },
                              ] as const
                            ).map(({ key, label, type }) => (
                              <label key={key} className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {label}
                                </span>
                                <input
                                  type={type}
                                  className="rounded border px-2 py-1 text-sm"
                                  value={editDrafts[candidate.id]?.[key] ?? ""}
                                  onChange={(e) =>
                                    setEditDrafts((prev) => ({
                                      ...prev,
                                      [candidate.id]: {
                                        ...prev[candidate.id],
                                        [key]: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            ))}
                            <label className="flex flex-col gap-1 sm:col-span-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Description
                              </span>
                              <textarea
                                className="rounded border px-2 py-1 text-sm"
                                rows={3}
                                value={editDrafts[candidate.id]?.description ?? ""}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [candidate.id]: {
                                      ...prev[candidate.id],
                                      description: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </div>
                        ) : null}

                        {candidate.status === "PENDING" && candidate.artistNames.length > 0 ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">Will discover: </span>
                            {candidate.artistNames.join(", ")}
                          </div>
                        ) : null}

                        {candidate.createdEventId ? (
                          <div className="mt-3 space-y-2 rounded border bg-background p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Pipeline status
                            </p>
                            {loadingPipelineFor.has(candidate.id) ? (
                              <p className="text-xs text-muted-foreground">Loading…</p>
                            ) : pipelineErrorById[candidate.id] ? (
                              <button
                                type="button"
                                className="text-xs text-destructive underline"
                                onClick={() => {
                                  setPipelineErrorById((prev) => {
                                    const next = { ...prev };
                                    delete next[candidate.id];
                                    return next;
                                  });
                                  void fetchPipelineStatus(candidate.id);
                                }}
                              >
                                Failed to load — retry
                              </button>
                            ) : pipelineStatusById[candidate.id] ? (
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={
                                      pipelineStatusById[candidate.id].imageStatus.attached
                                        ? "text-emerald-600"
                                        : "text-amber-600"
                                    }
                                  >
                                    {pipelineStatusById[candidate.id].imageStatus.attached
                                      ? "✓"
                                      : "○"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {pipelineStatusById[candidate.id].imageStatus.attached
                                      ? "Image attached"
                                      : "No image imported"}
                                  </span>
                                </div>

                                {pipelineStatusById[candidate.id].linkedArtists.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {pipelineStatusById[candidate.id].linkedArtists.map((a) => (
                                      <a
                                        key={a.id}
                                        href={`/admin/artists/${a.id}`}
                                        className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:underline dark:bg-emerald-900/30 dark:text-emerald-300"
                                      >
                                        {a.name}
                                      </a>
                                    ))}
                                    <span className="text-muted-foreground">linked</span>
                                  </div>
                                ) : null}

                                {pipelineStatusById[candidate.id].artistCandidates.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {pipelineStatusById[candidate.id].artistCandidates.map((a) => (
                                      <span
                                        key={a.id}
                                        className={`rounded px-2 py-0.5 ${
                                          a.status === "APPROVED"
                                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                            : a.status === "PENDING"
                                              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                              : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {a.name}
                                      </span>
                                    ))}
                                    <a
                                      href="/admin/ingest/artists"
                                      className="text-muted-foreground underline"
                                    >
                                      {pipelineStatusById[candidate.id].artistCandidates.length}{" "}
                                      candidate
                                      {pipelineStatusById[candidate.id].artistCandidates.length === 1
                                        ? ""
                                        : "s"}
                                    </a>
                                  </div>
                                ) : null}

                                {pipelineStatusById[candidate.id].artworkCandidates.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <a
                                      href="/admin/ingest/artworks"
                                      className="text-muted-foreground underline"
                                    >
                                      {pipelineStatusById[candidate.id].artworkCandidates.length}{" "}
                                      artwork
                                      {pipelineStatusById[candidate.id].artworkCandidates.length ===
                                      1
                                        ? ""
                                        : "s"}{" "}
                                      queued
                                    </a>
                                    <span className="text-muted-foreground">
                                      (
                                      {
                                        pipelineStatusById[
                                          candidate.id
                                        ].artworkCandidates.filter(
                                          (a) => a.status === "APPROVED",
                                        ).length
                                      }{" "}
                                      approved)
                                    </span>
                                  </div>
                                ) : null}

                                {pipelineStatusById[candidate.id].linked &&
                                pipelineStatusById[candidate.id].linkedArtists.length === 0 &&
                                pipelineStatusById[candidate.id].artistCandidates.length === 0 &&
                                pipelineStatusById[candidate.id].artworkCandidates.length ===
                                  0 ? (
                                  <p className="text-muted-foreground">
                                    No artists or artworks linked yet.
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground underline"
                                onClick={() => void fetchPipelineStatus(candidate.id)}
                              >
                                Load pipeline status
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {filteredCandidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={10}>
                  {venueFilter === "all"
                    ? "No pending candidates in the queue."
                    : "No pending candidates for this venue."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {hasMore && nextCursor ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={goToNextPage}
          >
            Load more
          </button>
        </div>
      ) : null}
      <Dialog open={bulkRejectConfirmOpen} onOpenChange={setBulkRejectConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject all LOW confidence candidates?</DialogTitle>
            <DialogDescription>
              This will reject {lowCandidates.length} pending LOW confidence event{lowCandidates.length === 1 ? "" : "s"} with reason &quot;{bulkRejectReason}&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() => setBulkRejectConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50"
              disabled={bulkRejectAction.running}
              onClick={() => {
                setBulkRejectConfirmOpen(false);
                void bulkRejectLow();
              }}
            >
              Confirm reject
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="mt-3 text-xs text-muted-foreground">
        {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
          <Fragment key={shortcut.key}>
            {index > 0 ? " · " : null}
            <kbd className="rounded border px-1 font-mono">{shortcut.key}</kbd>{" "}
            {shortcut.label}
          </Fragment>
        ))}
      </p>
    </section>
  );
}
