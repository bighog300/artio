"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const STEPS = [
  {
    label: "Schedule",
    description:
      "Venue websites are crawled on a configurable schedule (Daily / Weekly / Monthly). Go to Trigger / Runs → Venue schedule to see which venues are due.",
  },
  {
    label: "Extract",
    description:
      "An AI model reads each venue's events page and extracts candidate events with a confidence score. HIGH = safe to approve, MEDIUM = needs review, LOW = likely noise.",
  },
  {
    label: "Review",
    description:
      "Approve or reject candidates in the Event Queue. Use Bulk approve HIGH to clear ready candidates in one click. Use J/K/A/R keyboard shortcuts for fast triage.",
  },
  {
    label: "Artists & Artworks",
    description:
      "Approved events may generate artist and artwork candidates automatically. Review them in the Artists and Artworks tabs.",
  },
  {
    label: "Publish",
    description:
      "Approved artists and artworks appear in Ready to Publish. Once completeness is sufficient, publish them to make them live.",
  },
];

export function IngestHowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>How ingest works</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="border-t px-4 py-3">
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.label} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground">{" — "}{step.description}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
