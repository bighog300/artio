"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  approvedIds: string[];
};

export function BulkPublishEventsClient({ approvedIds: initialIds }: Props) {
  const [ids, setIds] = useState(initialIds);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    published: number;
    blocked: number;
    failed: number;
  } | null>(null);
  const [done, setDone] = useState(false);

  if (ids.length === 0) return null;

  async function bulkPublish() {
    if (
      !window.confirm(
        `Publish ${ids.length} approved event${ids.length === 1 ? "" : "s"}? Each will be checked for publish blockers — blocked events will be skipped.`,
      )
    )
      return;

    setRunning(true);
    setDone(false);
    setProgress({ done: 0, total: ids.length, published: 0, blocked: 0, failed: 0 });

    let published = 0;
    let blocked = 0;
    let failed = 0;
    const remaining = [...ids];

    for (const id of ids) {
      try {
        const res = await fetch(
          `/api/admin/events/${id}/moderation-intent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve_publish" }),
          },
        );
        if (res.ok) {
          published += 1;
          remaining.splice(remaining.indexOf(id), 1);
          setIds([...remaining]);
        } else if (res.status === 409) {
          blocked += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      setProgress({
        done: published + blocked + failed,
        total: ids.length,
        published,
        blocked,
        failed,
      });
    }

    setRunning(false);
    setDone(true);
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            {ids.length} approved event{ids.length === 1 ? "" : "s"} ready to publish
          </p>
          {done && progress ? (
            <p className="text-xs text-emerald-800/70 dark:text-emerald-300/70">
              {progress.published > 0 ? `${progress.published} published` : ""}
              {progress.published > 0 && (progress.blocked > 0 || progress.failed > 0) ? " · " : ""}
              {progress.blocked > 0 ? `${progress.blocked} blocked` : ""}
              {progress.blocked > 0 && progress.failed > 0 ? " · " : ""}
              {progress.failed > 0 ? `${progress.failed} failed` : ""}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-600 text-emerald-900 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
          onClick={() => void bulkPublish()}
          disabled={running}
        >
          {running
            ? `Publishing… ${progress?.done ?? 0}/${progress?.total ?? ids.length}`
            : `Publish all ${ids.length}`}
        </Button>
      </div>
    </div>
  );
}
