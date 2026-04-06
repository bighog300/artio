import { useMemo, useState } from "react";

type BulkProgress = {
  done: number;
  total: number;
};

type BulkResults = {
  succeeded: number;
  failed: number;
};

export function useBulkAction<T>(
  items: T[],
  action: (item: T) => Promise<"ok" | "fail">,
  options?: { batchSize?: number },
): {
  run: () => Promise<void>;
  running: boolean;
  progress: BulkProgress | null;
  results: BulkResults | null;
  clearResults: () => void;
} {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [results, setResults] = useState<BulkResults | null>(null);

  const batchSize = useMemo(() => Math.max(1, options?.batchSize ?? 5), [options?.batchSize]);

  async function run() {
    if (running || items.length === 0) return;

    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: items.length });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const settled = await Promise.allSettled(batch.map((item) => action(item)));

      for (const result of settled) {
        if (result.status === "fulfilled" && result.value === "ok") {
          succeeded += 1;
        } else {
          failed += 1;
        }
      }

      setProgress({ done: succeeded + failed, total: items.length });
    }

    setRunning(false);
    setProgress(null);
    setResults({ succeeded, failed });
  }

  function clearResults() {
    setResults(null);
  }

  return { run, running, progress, results, clearResults };
}
