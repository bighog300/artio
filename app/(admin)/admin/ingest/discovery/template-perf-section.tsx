"use client";

import { useState } from "react";
import { TemplatePerfPanel } from "@/app/(admin)/admin/ingest/discovery/template-perf";
import type { TemplatePerfRow } from "@/lib/discovery/template-perf-query";

export function TemplatePerfSection({
  initialRows,
}: { initialRows: TemplatePerfRow[] }) {
  const [filter, setFilter] = useState<"ALL" | "VENUE" | "ARTIST">("ALL");
  const filtered = filter === "ALL"
    ? initialRows
    : initialRows.filter((row) => row.entityType === filter);

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-semibold">Template performance</h2>
      <TemplatePerfPanel
        rows={filtered}
        entityTypeFilter={filter}
        onFilterChange={setFilter}
      />
    </section>
  );
}
