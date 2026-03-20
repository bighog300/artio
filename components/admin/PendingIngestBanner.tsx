"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  entity: "artists" | "artworks";
  total: number;
  high: number;
  medium: number;
  low: number;
  highIds: string[];
};

export default function PendingIngestBanner({
  entity,
  total,
  high,
  medium,
  low,
  highIds: initialHighIds,
}: Props) {
  const [highIds, setHighIds] = useState(initialHighIds);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(0);
  const [failed, setFailed] = useState(0);
  const [done, setDone] = useState(false);

  if (total === 0) return null;

  const approveEndpoint = (id: string) =>
    entity === "artists"
      ? `/api/admin/ingest/artists/${id}/approve`
      : `/api/admin/ingest/artworks/${id}/approve`;

  const queueHref = entity === "artists" ? "/admin/ingest/artists" : "/admin/ingest/artworks";

  async function approveAllHigh() {
    if (approving || highIds.length === 0) return;
    setApproving(true);
    setApproved(0);
    setFailed(0);

    let approvedCount = 0;
    let failedCount = 0;
    const remaining = [...highIds];

    for (const id of highIds) {
      try {
        const res = await fetch(approveEndpoint(id), { method: "POST" });
        if (res.ok) {
          approvedCount += 1;
          remaining.splice(remaining.indexOf(id), 1);
          setApproved(approvedCount);
          setHighIds([...remaining]);
        } else {
          failedCount += 1;
          setFailed(failedCount);
        }
      } catch {
        failedCount += 1;
        setFailed(failedCount);
      }
    }

    setApproving(false);
    setDone(true);
  }

  const bandParts: string[] = [];
  if (high > 0) bandParts.push(`${high} high`);
  if (medium > 0) bandParts.push(`${medium} medium`);
  if (low > 0) bandParts.push(`${low} low`);
  const bandSummary = bandParts.join(", ");

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {total} AI {entity === "artists" ? "artist" : "artwork"}{" "}
            {total === 1 ? "candidate" : "candidates"} pending
          </p>
          {bandSummary ? (
            <p className="text-xs text-amber-800/70 dark:text-amber-300/70">{bandSummary} confidence</p>
          ) : null}
          {done && (approved > 0 || failed > 0) ? (
            <p className="text-xs text-amber-800/70 dark:text-amber-300/70">
              {approved > 0 ? `${approved} approved` : ""}
              {approved > 0 && failed > 0 ? " · " : ""}
              {failed > 0 ? `${failed} failed` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {highIds.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-600 text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/30"
              onClick={() => void approveAllHigh()}
              disabled={approving}
            >
              {approving
                ? `Approving… (${approved}/${highIds.length})`
                : `Approve ${highIds.length} high confidence`}
            </Button>
          ) : null}
          <Link
            href={queueHref}
            className="text-xs text-amber-800 underline dark:text-amber-300"
          >
            Review full queue →
          </Link>
        </div>
      </div>
    </div>
  );
}
