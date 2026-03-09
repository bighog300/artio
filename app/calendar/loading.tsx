import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";

export default function Loading() {
  return (
    <PageShell className="page-stack">
      <PageHeader title="Calendar" subtitle="Your saved and followed events" />
      <div className="space-y-4">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between gap-3 pb-2">
          <div className="flex gap-2">
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        {/* Calendar grid skeleton */}
        <div className="h-[600px] w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </PageShell>
  );
}
