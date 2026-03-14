"use client";

import Link from "next/link";
import { useState } from "react";
import IngestCandidateActions from "@/app/(admin)/admin/ingest/_components/ingest-candidate-actions";
import IngestConfidenceBadge from "@/app/(admin)/admin/ingest/_components/ingest-confidence-badge";

type QueueCandidate = {
  id: string;
  title: string;
  imageUrl: string | null;
  blobImageUrl: string | null;
  startAt: Date | null;
  locationText: string | null;
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
  const reasons = value.filter((item): item is string => typeof item === "string");
  return reasons.length > 0 ? reasons : null;
}
export default function IngestEventQueueClient({ candidates }: { candidates: QueueCandidate[] }) {
  const [showReasons, setShowReasons] = useState(false);
  const [importingImageFor, setImportingImageFor] = useState<string | null>(null);
  const [importedImageFor, setImportedImageFor] = useState<Set<string>>(new Set());
  const [importImageError, setImportImageError] = useState<string | null>(null);

  async function importImage(candidateId: string, runId: string, imageUrl: string, setAsFeatured: boolean) {
    setImportingImageFor(candidateId);
    setImportImageError(null);
    try {
      const res = await fetch(`/api/admin/ingest/runs/${runId}/import-venue-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, setAsFeatured }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setImportImageError(body.error?.message ?? "Import failed.");
        return;
      }
      setImportedImageFor((prev) => new Set([...prev, candidateId]));
    } finally {
      setImportingImageFor(null);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
        <h2 className="text-base font-semibold">Pending Candidates</h2>
        <p className="text-sm text-muted-foreground">Showing up to 100 primary pending candidates from all venues.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showReasons} onChange={(event) => setShowReasons(event.target.checked)} />
          Show confidence reasons
        </label>
      </div>
      {importImageError ? (
        <div className="mb-3 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
          <span>{importImageError}</span>
          <button type="button" className="text-amber-700" onClick={() => setImportImageError(null)}>×</button>
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
            {candidates.map((candidate) => (
              <tr key={candidate.id} className="border-b align-top">
                <td className="px-3 py-2">
                  <IngestConfidenceBadge
                    score={candidate.confidenceScore}
                    band={getConfidenceBand(candidate.confidenceBand)}
                    reasons={getConfidenceReasons(candidate.confidenceReasons)}
                    showReasons={showReasons}
                  />
                </td>
                <td className="px-3 py-2">
                  {candidate.imageUrl
                    ? (
                      <div className="group relative h-10 w-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={candidate.blobImageUrl ?? candidate.imageUrl} alt={candidate.title} className="h-10 w-16 rounded object-cover" />
                        {candidate.status !== "DUPLICATE" ? (
                          <div className="absolute inset-0 hidden flex-col items-center justify-center gap-0.5 rounded bg-black/60 group-hover:flex">
                            <button
                              type="button"
                              className="text-[10px] leading-tight text-white underline disabled:opacity-50"
                              disabled={importingImageFor === candidate.id || importedImageFor.has(candidate.id)}
                              onClick={() => importImage(candidate.id, candidate.run.id, candidate.imageUrl!, false)}
                            >
                              {importedImageFor.has(candidate.id) ? "✓ added" : importingImageFor === candidate.id ? "…" : "+ gallery"}
                            </button>
                            <button
                              type="button"
                              className="text-[10px] leading-tight text-white underline disabled:opacity-50"
                              disabled={importingImageFor === candidate.id || importedImageFor.has(candidate.id)}
                              onClick={() => importImage(candidate.id, candidate.run.id, candidate.imageUrl!, true)}
                            >
                              {importingImageFor === candidate.id ? "" : "★ cover"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                    : "—"}
                </td>
                <td className="px-3 py-2 font-medium">{candidate.title}</td>
                <td className="px-3 py-2">{candidate.startAt ? new Date(candidate.startAt).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">{candidate.venue.name}</td>
                <td className="px-3 py-2">{candidate.locationText ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/ingest/runs/${candidate.run.id}`} className="underline">Run details</Link>
                  <div className="mt-1 max-w-[280px] truncate text-xs text-muted-foreground" title={candidate.run.sourceUrl}>
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
                  />
                </td>
              </tr>
            ))}
            {candidates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={8}>No pending candidates in the queue.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
