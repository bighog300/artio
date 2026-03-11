"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { track } from "@/lib/analytics/client";
import { setOnboardingStep } from "@/lib/onboarding/state";
import { OnboardingProgress, type OnboardingStepStatus } from "@/components/onboarding/onboarding-progress";
import { RecommendedFollows } from "@/components/onboarding/recommended-follows";
import { StartPacks } from "@/components/onboarding/start-packs";

export function OnboardingSheet({
  open,
  onOpenChange,
  page,
  steps,
  hasLocation,
  isAuthenticated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: string;
  steps: OnboardingStepStatus[];
  hasLocation: boolean;
  isAuthenticated: boolean;
}) {
  const clickStep = (step: OnboardingStepStatus["key"], destination: string) => {
    setOnboardingStep(step);
    track("onboarding_step_clicked", { step, destination });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="onboarding-sheet-description" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up your feed</DialogTitle>
          <DialogDescription id="onboarding-sheet-description">Pick one step to personalize Artio. Weekly digests and notifications become more relevant as you go.</DialogDescription>
        </DialogHeader>

        <OnboardingProgress steps={steps} />

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="font-medium">Follow artists or venues</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/artists" className="rounded border px-2 py-1" onClick={() => clickStep("follow", "/artists")}>Browse artists</Link>
              <Link href="/venues" className="rounded border px-2 py-1" onClick={() => clickStep("follow", "/venues")}>Browse venues</Link>
            </div>
            <div className="mt-3 space-y-3">
              <StartPacks page={page} isAuthenticated={isAuthenticated} />
              <RecommendedFollows page={page} source="onboarding_sheet" isAuthenticated={isAuthenticated} />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="font-medium">Save a search</p>
            <p className="text-muted-foreground">We&apos;ll send weekly digests when there are fresh matches.</p>
            <Link href="/search" className="mt-2 inline-block rounded border px-2 py-1" onClick={() => clickStep("saved_search", "/search")}>Create a saved search</Link>
          </div>

          <div className="rounded-lg border p-3">
            <p className="font-medium">Save an event</p>
            <Link href="/events" className="mt-2 inline-block rounded border px-2 py-1" onClick={() => clickStep("saved_event", "/events")}>Explore events</Link>
          </div>

          <div className="rounded-lg border p-3">
            <p className="font-medium">Enable nearby (optional)</p>
            <p className="text-muted-foreground">Nearby works best when your device shares location. Manage preferences in your location settings.</p>
            <p className="mt-2 text-xs text-muted-foreground">{hasLocation ? "Location enabled ✓" : "Enable location to use Nearby"}</p>
            <Link href="/nearby" className="mt-2 inline-block rounded border px-2 py-1" onClick={() => clickStep("location", "/nearby")}>Open nearby</Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Current page: {page}</p>
      </DialogContent>
    </Dialog>
  );
}
