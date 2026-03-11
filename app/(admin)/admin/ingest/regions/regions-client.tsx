"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { enqueueToast } from "@/lib/toast";

export type RegionListResponse = {
  regions: Array<{
    id: string;
    country: string;
    region: string;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PAUSED";
    venueGenDone: boolean;
    discoveryDone: boolean;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

function statusClassName(status: string): string {
  if (status === "RUNNING")
    return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  if (status === "SUCCEEDED")
    return "bg-green-100 text-green-800 hover:bg-green-100";
  if (status === "FAILED")
    return "bg-destructive text-destructive-foreground hover:bg-destructive";
  if (status === "PAUSED")
    return "bg-secondary text-secondary-foreground hover:bg-secondary";
  return "bg-muted text-muted-foreground hover:bg-muted";
}

export default function RegionsClient({
  initial,
}: {
  initial: RegionListResponse;
}) {
  const [regions, setRegions] = useState(initial.regions);
  const [submitting, setSubmitting] = useState(false);
  const [pausing, setPausing] = useState<Record<string, boolean>>({});
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");

  async function createRegion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ingest/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, region }),
      });
      if (!res.ok) throw new Error("Failed to create region");
      const data = (await res.json()) as { regionId: string };
      setRegions((prev) => [
        {
          id: data.regionId,
          country,
          region,
          status: "PENDING",
          venueGenDone: false,
          discoveryDone: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCountry("");
      setRegion("");
    } catch {
      enqueueToast({ title: "Failed to queue region", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function pauseRegion(id: string) {
    setPausing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/regions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to pause region");
      setRegions((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: "PAUSED" } : row)),
      );
    } catch {
      enqueueToast({ title: "Failed to pause region", variant: "error" });
    } finally {
      setPausing((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function resumeRegion(id: string) {
    setPausing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/regions/${id}/run-now`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to resume region");
      setRegions((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: "PENDING" } : row,
        ),
      );
    } catch {
      enqueueToast({ title: "Failed to resume region", variant: "error" });
    } finally {
      setPausing((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createRegion}>
          <label className="space-y-1 text-sm">
            <span>Country</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Region</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-background p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Venue Gen</TableHead>
              <TableHead>Discovery</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.country}</TableCell>
                <TableCell>{row.region}</TableCell>
                <TableCell>
                  <Badge className={statusClassName(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.venueGenDone ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.discoveryDone ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(row.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  {row.status === "PAUSED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resumeRegion(row.id)}
                      disabled={pausing[row.id]}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => pauseRegion(row.id)}
                      disabled={pausing[row.id]}
                    >
                      Pause
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {regions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No regions queued yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
