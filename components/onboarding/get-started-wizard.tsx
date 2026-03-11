"use client";

import Link from "next/link";
import { ErrorCard } from "@/components/ui/error-card";
import { LoadingCard } from "@/components/ui/loading-card";
import type { GetStartedProgress, GetStartedStep } from "@/lib/get-started";
import { useGetStartedState } from "@/components/onboarding/get-started-state";

function StepCard({ step, stepNumber, isCurrent }: { step: GetStartedStep; stepNumber: number; isCurrent: boolean }) {
  if (step.done) {
    return (
      <article className="rounded border border-emerald-500 bg-emerald-50/40 p-3">
        <p className="text-sm">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-600 text-xs text-emerald-700">✓</span>
          <span className="font-medium">Step {stepNumber}:</span> {step.title}
        </p>
      </article>
    );
  }

  return (
    <article className={`rounded border bg-card p-4 ${isCurrent ? "border-blue-500" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Step {stepNumber}</p>
          <h2 className="font-semibold">{step.title}</h2>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>
        <span className="rounded border px-2 py-1 text-xs">Not started</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {step.ctas.map((cta) => (
          <Link key={cta.href} href={cta.href} className="rounded border px-3 py-1 text-sm hover:bg-muted/50">{cta.label}</Link>
        ))}
      </div>
    </article>
  );
}

export function GetStartedWizardContent({ progress }: { progress: GetStartedProgress }) {
  if (progress.completedAll) {
    return (
      <section className="rounded border bg-emerald-50 p-4">
        <h2 className="text-lg font-semibold">You’re all set 🎉</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your personalization setup is complete.</p>
        <Link href="/for-you" className="mt-3 inline-block rounded border bg-card px-3 py-1 text-sm">Go to For You</Link>
      </section>
    );
  }

  const pct = Math.round((progress.completedCount / progress.totalCount) * 100);
  const currentIncompleteIndex = progress.steps.findIndex((step) => !step.done);

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-muted">
          <div style={{ width: `${pct}%` }} className="h-2 rounded-full bg-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Progress: {progress.completedCount}/{progress.totalCount} completed · Step {progress.currentStepNumber}/{progress.totalCount}
        </p>
      </div>

      {progress.steps.map((step, idx) => (
        <StepCard key={step.key} step={step} stepNumber={idx + 1} isCurrent={!step.done && idx === currentIncompleteIndex} />
      ))}
    </section>
  );
}

export function GetStartedWizard() {
  const { loading, error, progress, reload } = useGetStartedState();

  if (loading) return <LoadingCard lines={5} label="Loading onboarding wizard" />;
  if (error || !progress) return <ErrorCard message={error ?? "Unable to load onboarding wizard."} onRetry={() => void reload()} />;

  return <GetStartedWizardContent progress={progress} />;
}
