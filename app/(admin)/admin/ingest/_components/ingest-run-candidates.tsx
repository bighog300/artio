"use client";

import { Fragment, useMemo, useState } from "react";
import IngestStatusBadge from "@/app/(admin)/admin/ingest/_components/ingest-status-badge";
import IngestCandidateActions from "@/app/(admin)/admin/ingest/_components/ingest-candidate-actions";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";

type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
type Lane = "HIGH" | "NEEDS_REVIEW" | "LOW" | "ALL";

type Candidate = {
  id: string;
  title: string;
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

function inLane(candidate: Candidate, lane: Lane): boolean {
  if (lane === "ALL") return true;
  if (lane === "HIGH") return candidate.confidenceBand === "HIGH";
  if (lane === "LOW") return candidate.confidenceBand === "LOW";
  return candidate.confidenceBand === "MEDIUM";
}

export default function IngestRunCandidates({ candidates, venueId }: { candidates: Candidate[]; venueId: string }) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lane, setLane] = useState<Lane>("HIGH");

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Triage:</span>
        {([
          ["HIGH", "High"],
          ["NEEDS_REVIEW", "Needs review"],
          ["LOW", "Low"],
          ["ALL", "All"],
        ] as Array<[Lane, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${lane === value ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setLane(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showDuplicates} onChange={(event) => setShowDuplicates(event.target.checked)} />
        Show duplicates
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Start Date</th>
              <th className="px-3 py-2">Location</th>
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
                      <IngestConfidenceBadge
                        score={candidate.confidenceScore}
                        band={candidate.confidenceBand ?? "LOW"}
                        reasons={candidate.confidenceReasons}
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
                    </td>
                  </tr>
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
                        <IngestConfidenceBadge
                          score={duplicate.confidenceScore}
                          band={duplicate.confidenceBand ?? "LOW"}
                          reasons={duplicate.confidenceReasons}
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
                <td className="px-3 py-6 text-muted-foreground" colSpan={6}>No extracted candidates in this lane.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
