"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGetStartedState } from "@/components/onboarding/get-started-state";
import { isGetStartedBannerDismissed, setGetStartedBannerDismissed } from "@/lib/get-started-banner-storage";

export function GetStartedBanner() {
  const { loading, progress } = useGetStartedState();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isGetStartedBannerDismissed());
  }, []);

  if (dismissed || loading || !progress || progress.completedAll) return null;

  const nextStep = progress.steps.find((step) => !step.done);

  return (
    <aside className="flex items-center justify-between gap-3 rounded border bg-muted/50 p-3">
      <p className="text-sm">Next: {nextStep?.title ?? "Finish setup"} — Finish setup ({progress.completedCount}/{progress.totalCount}) →</p>
      <div className="flex items-center gap-3">
        <Link href="/get-started" className="text-sm underline">Finish setup →</Link>
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => {
            setDismissed(true);
            setGetStartedBannerDismissed(true);
          }}
        >
          Hide banner for now
        </button>
      </div>
    </aside>
  );
}
