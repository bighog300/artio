import type { PrismaClient } from "@prisma/client";

export type EnrichmentSettings = {
  gapFilter?: "ALL" | "MISSING_BIO" | "MISSING_DESCRIPTION" | "MISSING_IMAGE";
  searchEnabled?: boolean;
  googlePseApiKey?: string | null;
  googlePseCx?: string | null;
  braveSearchApiKey?: string | null;
  openAiApiKey?: string | null;
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
  artistBioProvider?: string | null;
  artworkExtractionProvider?: string | null;
  venueEnrichmentProvider?: string | null;
  artistBioSystemPrompt?: string | null;
  artworkExtractionSystemPrompt?: string | null;
};

export type EnrichItemResult = {
  status: "success" | "skipped" | "failed";
  fieldsChanged: string[];
  fieldsBefore: Record<string, unknown>;
  fieldsAfter: Record<string, unknown>;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  searchUrl: string | null;
  reason?: string;
};

export type EnrichmentFnArgs = {
  db: PrismaClient;
  settings: EnrichmentSettings;
  searchProvider: "google_pse" | "brave";
};

export function buildTemplateQuery(template: string, params: { name?: string | null; title?: string | null }): string {
  return template
    .replaceAll("[name]", (params.name ?? "").trim())
    .replaceAll("[title]", (params.title ?? "").trim())
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldApply(current: string | null | undefined, incoming: string | null, gapFilter: EnrichmentSettings["gapFilter"]): incoming is string {
  const next = incoming?.trim();
  if (!next) return false;
  const existing = current?.trim() ?? "";
  if (!existing) return true;
  return gapFilter === "ALL" && next.length > existing.length;
}
