"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enqueueToast } from "@/lib/toast";

export type DirectorySourcesListResponse = {
  sources: Array<{
    id: string;
    name: string;
    baseUrl: string;
    indexPattern: string;
    linkPattern: string | null;
    entityType: string;
    isActive: boolean;
    crawlIntervalMinutes: number;
    maxPagesPerLetter: number;
    pipelineMode: string;
    lastPipelineRunAt: string | null;
    lastPipelineError: string | null;
    lastRunFound: number | null;
    lastRunStrategy: string | null;
    lastRunError: string | null;
    createdAt: string;
    cursor: {
      currentLetter: string;
      currentPage: number;
      lastRunAt: string | null;
      lastSuccessAt: string | null;
      lastError: string | null;
    } | null;
    _count: { entities: number };
  }>;
};

type DetectedSection = {
  name: string;
  url: string;
  contentType: string;
  indexPattern: string | null;
  linkPattern: string | null;
  paginationType: string;
  confidence: number;
};

type AnalysisResult = {
  hostname: string;
  platform: string | null;
  directoryUrl: string | null;
  indexPattern: string | null;
  linkPattern: string | null;
  paginationType: string;
  exhibitionPattern: string | null;
  sampleProfileUrls: string[];
  estimatedArtistCount: number | null;
  confidence: number;
  reasoning: string;
  analysisError: string | null;
  detectedSections: DetectedSection[];
  siteProfileId: string;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  if (abs < 60_000) return future ? "in <1 min" : "just now";
  if (abs < 3_600_000) return `${future ? "in " : ""}${Math.round(abs / 60_000)} min${future ? "" : " ago"}`;
  if (abs < 86_400_000) return `${future ? "in " : ""}${Math.round(abs / 3_600_000)} hr${future ? "" : " ago"}`;
  return `${future ? "in " : ""}${Math.round(abs / 86_400_000)} day${future ? "" : " ago"}`;
}

export default function DirectorySourcesClient({ initial }: { initial: DirectorySourcesListResponse }) {
  const [sources, setSources] = useState(initial.sources);
  const [submitting, setSubmitting] = useState(false);
  const [runningById, setRunningById] = useState<Record<string, boolean>>({});
  const [pipelineResultById, setPipelineResultById] = useState<Record<string, string>>({});
  const [pipeliningById, setPipeliningById] = useState<Record<string, boolean>>({});

  const [wizardStep, setWizardStep] = useState<"closed" | "analyse" | "confirm">("closed");
  const [analyseInput, setAnalyseInput] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [confirmedName, setConfirmedName] = useState("");
  const [confirmedBaseUrl, setConfirmedBaseUrl] = useState("");
  const [confirmedIndexPattern, setConfirmedIndexPattern] = useState("");
  const [confirmedLinkPattern, setConfirmedLinkPattern] = useState("");
  const [confirmedPipelineMode, setConfirmedPipelineMode] = useState<"manual" | "auto_discover" | "auto_full">("auto_discover");

  async function runAnalysis() {
    setAnalysing(true);
    try {
      const res = await fetch("/api/admin/ingest/directory-sources/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: analyseInput.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? "Analysis failed");
      }
      const data = await res.json() as AnalysisResult;
      setAnalysis(data);
      setConfirmedName(data.hostname);
      setConfirmedBaseUrl(data.directoryUrl ?? `https://${data.hostname}/artists/`);
      setConfirmedIndexPattern(data.indexPattern ?? "");
      setConfirmedLinkPattern(data.linkPattern ?? "");
      setWizardStep("confirm");
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Analysis failed", variant: "error" });
    } finally {
      setAnalysing(false);
    }
  }

  async function confirmCreate() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ingest/directory-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: confirmedName,
          baseUrl: confirmedBaseUrl,
          indexPattern: confirmedIndexPattern,
          linkPattern: confirmedLinkPattern || null,
          entityType: "ARTIST",
          crawlIntervalMinutes: 10080,
          maxPagesPerLetter: 5,
          pipelineMode: confirmedPipelineMode,
          siteProfileId: analysis?.siteProfileId ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? "Failed to create source");
      }
      enqueueToast({ title: "Directory source created", variant: "success" });
      setWizardStep("closed");
      setAnalysis(null);
      window.location.reload();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to create source", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function runNow(id: string) {
    setRunningById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to run crawl");
      await res.json() as { letter: string; page: number; found: number; newEntities: number };
      enqueueToast({ title: "Directory crawl run complete", variant: "success" });
      window.location.reload();
    } catch {
      enqueueToast({ title: "Failed to run crawl", variant: "error" });
    } finally {
      setRunningById((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function runPipeline(id: string, sourcePipelineMode: string) {
    setPipeliningById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineMode: sourcePipelineMode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? "Failed to run pipeline");
      }
      const data = await res.json() as {
        letter: string;
        entitiesCrawled: number;
        artistsDiscovered: number;
        artworksExtracted: number;
        errors: string[];
      };
      setPipelineResultById((prev) => ({
        ...prev,
        [id]: `${data.letter}: ${data.entitiesCrawled} crawled, ${data.artistsDiscovered} artists, ${data.artworksExtracted} artworks`,
      }));
      enqueueToast({ title: "Pipeline run complete", variant: "success" });
    } catch (error) {
      enqueueToast({
        title: error instanceof Error ? error.message : "Pipeline failed",
        variant: "error",
      });
    } finally {
      setPipeliningById((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error("Failed to update source");
      setSources((prev) => prev.map((source) => source.id === id ? { ...source, isActive: !isActive } : source));
    } catch {
      enqueueToast({ title: "Failed to update source", variant: "error" });
    }
  }

  async function deleteSource(id: string) {
    if (!window.confirm("Delete this directory source and all entities?")) return;
    try {
      const res = await fetch(`/api/admin/ingest/directory-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete source");
      setSources((prev) => prev.filter((source) => source.id !== id));
    } catch {
      enqueueToast({ title: "Failed to delete source", variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background p-4">
        {wizardStep === "closed" ? (
          <Button type="button" onClick={() => setWizardStep("analyse")}>Add source</Button>
        ) : wizardStep === "analyse" ? (
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Analyse a website</h3>
            <p className="text-sm text-muted-foreground">
              Enter a URL — the system will fetch the site and automatically propose an artist directory configuration.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="art.co.za or https://www.saatchiart.com"
                value={analyseInput}
                onChange={(e) => setAnalyseInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !analysing) void runAnalysis(); }}
              />
              <Button type="button" disabled={analysing || !analyseInput.trim()} onClick={() => void runAnalysis()}>
                {analysing ? "Analysing…" : "Analyse"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setWizardStep("closed")}>Cancel</Button>
            </div>
            {analysing && (
              <p className="text-sm text-muted-foreground animate-pulse">
                Fetching and analysing site — this takes 20–40 seconds…
              </p>
            )}
          </div>
        ) : wizardStep === "confirm" && analysis ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Confirm configuration for {analysis.hostname}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                analysis.confidence >= 80 ? "bg-emerald-100 text-emerald-800"
                  : analysis.confidence >= 50 ? "bg-amber-100 text-amber-700"
                    : "bg-destructive/15 text-destructive"
              }`}>
                {analysis.confidence}% confidence
              </span>
            </div>

            {analysis.reasoning ? (
              <p className="text-sm text-muted-foreground border-l-2 pl-3 italic">{analysis.reasoning}</p>
            ) : null}

            {analysis.analysisError ? (
              <p className="text-sm text-destructive">⚠ {analysis.analysisError}</p>
            ) : null}
            {analysis.detectedSections.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Content sections detected — will be created as ingestion paths
                </div>
                <div className="space-y-1">
                  {analysis.detectedSections.map((section) => (
                    <div key={section.url} className="flex items-center gap-2 text-xs rounded border px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${
                        section.contentType === "artist" ? "bg-purple-100 text-purple-800"
                          : section.contentType === "event" ? "bg-blue-100 text-blue-800"
                            : section.contentType === "exhibition" ? "bg-amber-100 text-amber-700"
                              : "bg-muted text-muted-foreground"
                      }`}>
                        {section.contentType}
                      </span>
                      <span className="font-medium">{section.name}</span>
                      <span className="text-muted-foreground truncate max-w-[200px]">{section.url}</span>
                      <span className="ml-auto text-muted-foreground">{section.confidence}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each section becomes an ingestion path — enable or disable them after creation.
                </p>
              </div>
            ) : null}

            {analysis.sampleProfileUrls.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Sample profiles found</div>
                {analysis.sampleProfileUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-muted-foreground underline truncate max-w-md"
                  >
                    {url}
                  </a>
                ))}
              </div>
            )}

            {analysis.estimatedArtistCount ? (
              <p className="text-xs text-muted-foreground">~{analysis.estimatedArtistCount.toLocaleString()} estimated artists</p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 border-t pt-3">
              <label className="space-y-1 text-sm">
                <span>Name</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={confirmedName}
                  onChange={(e) => setConfirmedName(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Base URL</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={confirmedBaseUrl}
                  onChange={(e) => setConfirmedBaseUrl(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span>Index pattern</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  value={confirmedIndexPattern}
                  onChange={(e) => setConfirmedIndexPattern(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span>Link pattern <span className="text-muted-foreground">(regex)</span></span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  value={confirmedLinkPattern}
                  onChange={(e) => setConfirmedLinkPattern(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Pipeline mode</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={confirmedPipelineMode}
                  onChange={(e) => setConfirmedPipelineMode(e.target.value as typeof confirmedPipelineMode)}
                >
                  <option value="manual">Manual — admin controls each step</option>
                  <option value="auto_discover">Auto discover — crawl + queue automatically</option>
                  <option value="auto_full">Auto full — crawl + discover + artworks</option>
                </select>
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={submitting || !confirmedIndexPattern.includes("[letter]")}
                onClick={() => void confirmCreate()}
              >
                {submitting ? "Creating…" : "Create directory source"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setWizardStep("analyse")}>Back</Button>
              <Button type="button" variant="outline" onClick={() => { setWizardStep("closed"); setAnalysis(null); }}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-background p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Entity type</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pipeline mode</TableHead>
              <TableHead>Cursor position</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Entities found</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell>{source.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{source.entityType}</Badge>
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{source.indexPattern}</TableCell>
                <TableCell>
                  <button type="button" className={`rounded px-2 py-0.5 text-xs ${source.isActive ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`} onClick={() => toggleActive(source.id, source.isActive)}>
                    {source.isActive ? "Active" : "Inactive"}
                  </button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{source.pipelineMode}</div>
                  <div>{relativeTime(source.lastPipelineRunAt)}</div>
                </TableCell>
                <TableCell className="text-sm">{source.cursor ? `${source.cursor.currentLetter} / p${source.cursor.currentPage}` : "Not started"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{relativeTime(source.cursor?.lastRunAt ?? null)}</TableCell>
                <TableCell>
                  {source.lastRunError ? (
                    <span className="block max-w-[200px] truncate text-xs text-destructive" title={source.lastRunError}>
                      ⚠ {source.lastRunError.slice(0, 60)}
                    </span>
                  ) : source.lastRunFound != null ? (
                    <span className="text-xs text-muted-foreground">
                      {source.lastRunFound} found
                      {source.lastRunStrategy ? ` · ${source.lastRunStrategy}` : ""}
                    </span>
                  ) : null}
                  {source.lastPipelineError ? (
                    <span className="block max-w-[200px] truncate text-xs text-destructive" title={source.lastPipelineError}>
                      ⚠ {source.lastPipelineError.slice(0, 60)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={runningById[source.id]} onClick={() => runNow(source.id)}>
                      {runningById[source.id] ? "Running…" : "Run now"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pipeliningById[source.id]}
                      onClick={() => runPipeline(source.id, source.pipelineMode)}
                    >
                      {pipeliningById[source.id] ? "Running…" : "Run pipeline"}
                    </Button>
                    <Link href={`/admin/ingest/directory-sources/${source.id}`} className="text-sm underline">View entities</Link>
                    <Button type="button" size="sm" variant="outline" onClick={() => deleteSource(source.id)}>Delete</Button>
                    <span className="text-xs text-muted-foreground">{source._count.entities} total entities</span>
                    {pipelineResultById[source.id] ? (
                      <span className="text-xs text-muted-foreground">{pipelineResultById[source.id]}</span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
