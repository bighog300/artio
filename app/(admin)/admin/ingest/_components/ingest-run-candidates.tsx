"use client";

import { Fragment, useMemo, useState } from "react";
import { useBulkAction } from "@/app/(admin)/admin/ingest/_hooks/use-bulk-action";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestCandidateActions from "@/app/(admin)/admin/ingest/_components/ingest-candidate-actions";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";
import IngestImageCell from "@/app/(admin)/admin/ingest/_components/ingest-image-cell";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";

type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
type Lane = "HIGH" | "NEEDS_REVIEW" | "LOW" | "ALL";

type Candidate = {
  id: string;
  title: string;
  artistNames: string[];
  imageUrl: string | null;
  blobImageUrl: string | null;
  startAt: string | null;
  locationText: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";
  rejectionReason: string | null;
  createdEventId: string | null;
  duplicateOfId: string | null;
  similarityScore: number | null;
  confidenceScore: number;
  confidenceBand: ConfidenceBand | null;
  confidenceReasons: string[] | null;
};

type PipelineStatus = {
  linked: boolean;
  eventId?: string;
  linkedArtists: Array<{ id: string; name: string; slug: string }>;
  artistCandidates: Array<{ id: string; name: string; status: string }>;
  artworkCandidates: Array<{ id: string; title: string; status: string; imageUrl: string | null }>;
  imageStatus: { attached: boolean; url: string | null };
};

function inLane(candidate: Candidate, lane: Lane): boolean {
  if (lane === "ALL") return true;
  if (lane === "HIGH") return candidate.confidenceBand === "HIGH";
  if (lane === "LOW") return candidate.confidenceBand === "LOW";
  return candidate.confidenceBand === "MEDIUM";
}

export default function IngestRunCandidates({ candidates, venueId, runId }: { candidates: Candidate[]; venueId: string; runId: string }) {
  void runId;
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lane, setLane] = useState<Lane>("HIGH");
  const [pipelineOpenById, setPipelineOpenById] = useState<Record<string, boolean>>({});
  const [pipelineDataById, setPipelineDataById] = useState<Record<string, PipelineStatus | null>>({});
  const [pipelineLoadingById, setPipelineLoadingById] = useState<Record<string, boolean>>({});

  const highCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.status !== "DUPLICATE")
        .filter((candidate) => inLane(candidate, lane))
        .filter((candidate) => candidate.confidenceBand === "HIGH" && candidate.status === "PENDING"),
    [candidates, lane],
  );

  const bulkApproveAction = useBulkAction(
    highCandidates,
    async (candidate) => {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidate.id}/approve`, {
        method: "POST",
      }).catch(() => null);
      return res?.ok ? "ok" : "fail";
    },
  );

  async function bulkApproveHigh() {
    await bulkApproveAction.run();
  }


  const laneCounts = useMemo(() => ({
    HIGH: candidates.filter((c) => c.status !== "DUPLICATE" && c.confidenceBand === "HIGH").length,
    NEEDS_REVIEW: candidates.filter((c) => c.status !== "DUPLICATE" && c.confidenceBand === "MEDIUM").length,
    LOW: candidates.filter((c) => c.status !== "DUPLICATE" && c.confidenceBand === "LOW").length,
    ALL: candidates.filter((c) => c.status !== "DUPLICATE").length,
  }), [candidates]);

  const grouped = useMemo(() => {
    const primaryCandidates = candidates
      .filter((candidate) => candidate.status !== "DUPLICATE")
      .filter((candidate) => inLane(candidate, lane))
      .sort((a, b) => b.confidenceScore - a.confidenceScore || (a.startAt ?? "").localeCompare(b.startAt ?? "") || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

    const duplicatesByPrimary = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      if (candidate.status !== "DUPLICATE" || !candidate.duplicateOfId) continue;
      const rows = duplicatesByPrimary.get(candidate.duplicateOfId) ?? [];
      rows.push(candidate);
      duplicatesByPrimary.set(candidate.duplicateOfId, rows);
    }

    for (const rows of duplicatesByPrimary.values()) {
      rows.sort((a, b) => b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    }

    return { primaryCandidates, duplicatesByPrimary };
  }, [candidates, lane]);

  async function loadPipeline(candidateId: string) {
    if (pipelineDataById[candidateId] !== undefined) return;
    setPipelineLoadingById((prev) => ({ ...prev, [candidateId]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidateId}/pipeline-status`);
      if (res.ok) {
        const data = await res.json() as PipelineStatus;
        setPipelineDataById((prev) => ({ ...prev, [candidateId]: data }));
      } else {
        setPipelineDataById((prev) => ({ ...prev, [candidateId]: null }));
      }
    } catch {
      setPipelineDataById((prev) => ({ ...prev, [candidateId]: null }));
    } finally {
      setPipelineLoadingById((prev) => ({ ...prev, [candidateId]: false }));
    }
  }

  function togglePipeline(candidateId: string) {
    const isOpen = !pipelineOpenById[candidateId];
    setPipelineOpenById((prev) => ({ ...prev, [candidateId]: isOpen }));
    if (isOpen) void loadPipeline(candidateId);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Triage:</span>
          {([
          ["HIGH", "Auto-approve"],
          ["NEEDS_REVIEW", "Needs review"],
          ["LOW", "Likely noise"],
          ["ALL", "All"],
          ] as Array<[Lane, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded border px-2 py-1 text-xs ${lane === value ? "bg-primary text-primary-foreground" : "bg-background"}`}
              onClick={() => setLane(value)}
            >
              {label} <span className="text-muted-foreground">{laneCounts[value]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showReasons} onChange={(event) => setShowReasons(event.target.checked)} />
            Show confidence reasons
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDuplicates} onChange={(event) => setShowDuplicates(event.target.checked)} />
            Show duplicates
          </label>
          {(() => {
            const highCount = grouped.primaryCandidates.filter(
              (c) => c.confidenceBand === "HIGH" && c.status === "PENDING",
            ).length;
            if (highCount === 0) return null;
            return (
              <button
                type="button"
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                disabled={bulkApproveAction.running}
                onClick={() => {
                  if (!window.confirm(`Approve all ${highCount} HIGH confidence candidate${highCount === 1 ? "" : "s"} in this run?`)) return;
                  void bulkApproveHigh();
                }}
              >
                {bulkApproveAction.running
                  ? `Approving… ${bulkApproveAction.progress?.done ?? 0}/${bulkApproveAction.progress?.total ?? highCount}`
                  : `Approve all HIGH (${highCount})`}
              </button>
            );
          })()}
        </div>
      </div>
      {bulkApproveAction.results ? (
        <div className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
          bulkApproveAction.results.failed > 0
            ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
        }`}>
          <span>
            Bulk approve complete: {bulkApproveAction.results.succeeded} approved
            {bulkApproveAction.results.failed > 0 ? `, ${bulkApproveAction.results.failed} failed` : ""}
          </span>
          <button type="button" onClick={bulkApproveAction.clearResults}>×</button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Start Date</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2" title="Hover to import image to venue library. Event cover is set on approval.">Image</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grouped.primaryCandidates.map((candidate) => {
              const duplicates = grouped.duplicatesByPrimary.get(candidate.id) ?? [];
              const isExpanded = expanded[candidate.id] ?? false;

              return (
                <Fragment key={candidate.id}>
                  <tr className="border-b align-top">
                    <td className="px-3 py-2 font-medium">
                      {candidate.title}
                      {candidate.artistNames.length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {candidate.artistNames.join(", ")}
                        </div>
                      ) : null}
                      {duplicates.length > 0 ? (
                        <button
                          className="ml-2 text-xs underline"
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [candidate.id]: !isExpanded }))}
                        >
                          +{duplicates.length} duplicates
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{candidate.startAt ? new Date(candidate.startAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">{candidate.locationText ?? "—"}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const display = resolveAssetDisplay({
                          legacyUrl: candidate.blobImageUrl ?? candidate.imageUrl,
                          requestedVariant: "thumb",
                        });
                        return display.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={display.url}
                            alt={candidate.title}
                            className="h-10 w-10 flex-shrink-0 rounded object-cover bg-muted"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 rounded bg-muted" />
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <IngestConfidenceBadge
                        score={candidate.confidenceScore}
                        band={candidate.confidenceBand ?? "LOW"}
                        reasons={candidate.confidenceReasons}
                        showReasons={showReasons}
                      />
                    </td>
                    <td className="px-3 py-2"><IngestStatusBadge status={candidate.status} /></td>
                    <td className="px-3 py-2">
                      <IngestCandidateActions
                        candidateId={candidate.id}
                        venueId={venueId}
                        status={candidate.status}
                        createdEventId={candidate.createdEventId}
                        rejectionReason={candidate.rejectionReason}
                      />
                      <button
                        type="button"
                        className="mt-1 text-xs text-muted-foreground underline"
                        onClick={() => togglePipeline(candidate.id)}
                      >
                        {pipelineOpenById[candidate.id] ? "Hide pipeline ▲" : "Pipeline ▼"}
                      </button>
                    </td>
                  </tr>
                  {pipelineOpenById[candidate.id] ? (
                    <tr>
                      <td colSpan={7} className="border-b bg-muted/30 px-4 py-3">
                        {pipelineLoadingById[candidate.id] ? (
                          <p className="text-xs text-muted-foreground">Loading pipeline…</p>
                        ) : pipelineDataById[candidate.id] === null ? (
                          <p className="text-xs text-destructive">Failed to load pipeline status.</p>
                        ) : !pipelineDataById[candidate.id]?.linked ? (
                          <p className="text-xs text-muted-foreground">Event not yet created — approve this candidate first.</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <p className="mb-1 font-medium">Artists linked ({pipelineDataById[candidate.id]!.linkedArtists.length})</p>
                              {pipelineDataById[candidate.id]!.linkedArtists.length === 0
                                ? <p className="text-muted-foreground">None linked</p>
                                : pipelineDataById[candidate.id]!.linkedArtists.map((artist) => (
                                  <a key={artist.id} href={`/admin/artists/${artist.id}`} className="block underline">{artist.name}</a>
                                ))}
                            </div>
                            <div>
                              <p className="mb-1 font-medium">Artist candidates ({pipelineDataById[candidate.id]!.artistCandidates.length})</p>
                              {pipelineDataById[candidate.id]!.artistCandidates.length === 0
                                ? <p className="text-muted-foreground">None queued</p>
                                : pipelineDataById[candidate.id]!.artistCandidates.map((artist) => (
                                  <a key={artist.id} href="/admin/ingest/artists" className="block underline">{artist.name} <span className="text-muted-foreground">({artist.status})</span></a>
                                ))}
                            </div>
                            <div>
                              <p className="mb-1 font-medium">Artwork candidates ({pipelineDataById[candidate.id]!.artworkCandidates.length})</p>
                              {pipelineDataById[candidate.id]!.artworkCandidates.length === 0
                                ? <p className="text-muted-foreground">None queued</p>
                                : pipelineDataById[candidate.id]!.artworkCandidates.map((artwork) => (
                                  <p key={artwork.id}>{artwork.title} <span className="text-muted-foreground">({artwork.status})</span></p>
                                ))}
                              <p className="mt-2 font-medium">Image</p>
                              <p className={pipelineDataById[candidate.id]!.imageStatus.attached ? "text-emerald-700" : "text-muted-foreground"}>
                                {pipelineDataById[candidate.id]!.imageStatus.attached ? "✓ Attached" : "— No image"}
                              </p>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  {showDuplicates && isExpanded ? duplicates.map((duplicate) => (
                    <tr key={duplicate.id} className="border-b align-top bg-muted/20">
                      <td className="px-3 py-2 pl-8">
                        {duplicate.title}
                        <div className="text-xs text-muted-foreground" title={duplicate.similarityScore !== null ? `Similarity ${duplicate.similarityScore}` : undefined}>
                          Duplicate of {candidate.title}
                        </div>
                      </td>
                      <td className="px-3 py-2">{duplicate.startAt ? new Date(duplicate.startAt).toLocaleString() : "—"}</td>
                      <td className="px-3 py-2">{duplicate.locationText ?? "—"}</td>
                      <td className="px-3 py-2">
                        <IngestImageCell
                          imageUrl={duplicate.imageUrl}
                          blobImageUrl={duplicate.blobImageUrl}
                          altText={duplicate.title}
                          importStatus="none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <IngestConfidenceBadge
                          score={duplicate.confidenceScore}
                          band={duplicate.confidenceBand ?? "LOW"}
                          reasons={duplicate.confidenceReasons}
                          showReasons={showReasons}
                        />
                      </td>
                      <td className="px-3 py-2"><IngestStatusBadge status={duplicate.status} /></td>
                      <td className="px-3 py-2"><span className="text-xs text-muted-foreground">No actions</span></td>
                    </tr>
                  )) : null}
                </Fragment>
              );
            })}
            {grouped.primaryCandidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={7}>No extracted candidates in this lane.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
