"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import IngestCandidateActions from "@/app/(admin)/admin/ingest/_components/ingest-candidate-actions";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";

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
  candidates,
  venues = [],
  userRole,
}: {
  candidates: QueueCandidate[];
  venues?: Array<{ id: string; name: string }>;
  userRole?: "USER" | "EDITOR" | "ADMIN";
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
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkResults, setBulkResults] = useState<{
    approved: number;
    failed: number;
  } | null>(null);

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
    );

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

  async function bulkApproveHigh() {
    const highCandidates = filteredCandidates.filter(
      (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
    );
    if (highCandidates.length === 0) return;

    setBulkApproving(true);
    setBulkResults(null);
    setBulkProgress({ done: 0, total: highCandidates.length });

    let approved = 0;
    let failed = 0;

    for (const candidate of highCandidates) {
      try {
        const res = await fetch(
          `/api/admin/ingest/extracted-events/${candidate.id}/approve`,
          { method: "POST" },
        );
        if (res.ok) {
          approved += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      setBulkProgress({ done: approved + failed, total: highCandidates.length });
    }

    setBulkApproving(false);
    setBulkProgress(null);
    setBulkResults({ approved, failed });
    router.refresh();
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Pending Candidates</h2>
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
          {(() => {
            const highCount = filteredCandidates.filter(
              (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
            ).length;
            if (highCount === 0) return null;
            return (
              <button
                type="button"
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                disabled={bulkApproving}
                onClick={() => {
                  if (!window.confirm(`Approve all ${highCount} HIGH confidence candidate${highCount === 1 ? "" : "s"}? This cannot be undone.`)) return;
                  void bulkApproveHigh();
                }}
              >
                {bulkApproving
                  ? `Approving… ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? highCount}`
                  : `Approve all HIGH (${highCount})`}
              </button>
            );
          })()}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {venueFilter === "all"
              ? "Showing up to 100 primary pending candidates from all venues."
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
      {bulkResults ? (
        <div
          className={`mb-3 flex items-center justify-between rounded border px-3 py-2 text-sm ${
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Image</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Start Date</th>
              <th className="px-3 py-2">Venue</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Run Source</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((candidate) => (
              <Fragment key={candidate.id}>
                <tr className="border-b align-top">
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
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === candidate.id ? null : candidate.id,
                        )
                      }
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
                    <Link
                      href={`/admin/ingest/runs/${candidate.run.id}`}
                      className="underline"
                    >
                      Run details
                    </Link>
                    <div
                      className="mt-1 max-w-[280px] truncate text-xs text-muted-foreground"
                      title={candidate.run.sourceUrl}
                    >
                      {candidate.run.sourceUrl}
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
                    />
                  </td>
                </tr>
                {expandedId === candidate.id ? (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={8} className="px-4 py-3 text-sm">
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
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {filteredCandidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={8}>
                  {venueFilter === "all"
                    ? "No pending candidates in the queue."
                    : "No pending candidates for this venue."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
