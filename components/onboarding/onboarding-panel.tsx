"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isOnboardingPanelDismissed, setOnboardingPanelDismissed } from "@/lib/onboarding-panel-storage";

type ChecklistItem = {
  flag: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

type OnboardingPayload = {
  state: { completedAt: string | null } | null;
  checklist: ChecklistItem[];
};

export function OnboardingPanel() {
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [payload, setPayload] = useState<OnboardingPayload | null>(null);

  useEffect(() => {
    setDismissed(isOnboardingPanelDismissed());
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as OnboardingPayload;
        if (!cancelled) setPayload(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const remainingCount = useMemo(() => payload?.checklist.filter((item) => !item.done).length ?? 0, [payload]);

  if (loading || dismissed || !payload || payload.state?.completedAt) return null;

  return (
    <aside className="rounded border bg-muted/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Get started on Artio</h2>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            setDismissed(true);
            setOnboardingPanelDismissed(true);
          }}
        >
          Hide for now
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{remainingCount} step{remainingCount === 1 ? "" : "s"} remaining</p>
      <ul className="mt-3 space-y-2">
        {payload.checklist.map((item) => (
          <li key={item.flag} className="rounded border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{item.done ? "✓ " : ""}{item.title}</p>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
              {!item.done ? <Link className="whitespace-nowrap underline" href={item.href}>Go</Link> : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
