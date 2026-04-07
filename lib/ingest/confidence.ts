import type { NormalizedExtractedEvent } from "@/lib/ingest/schemas";

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

const MAX_REASONS = 8;
const MAX_REASON_LENGTH = 80;
const GENERIC_TITLES = new Set(["home", "untitled", "event", "click here"]);
const NAV_NOISE = /^(calendar|events?|january|february|march|april|may|june|july|august|september|october|november|december)$/i;

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function getHighMin(override?: number | null) {
  if (typeof override === "number" && Number.isFinite(override)) return override;
  const parsed = Number.parseInt(process.env.AI_INGEST_CONFIDENCE_HIGH_MIN ?? "75", 10);
  return Number.isFinite(parsed) ? parsed : 75;
}

function getMediumMin(override?: number | null) {
  if (typeof override === "number" && Number.isFinite(override)) return override;
  const parsed = Number.parseInt(process.env.AI_INGEST_CONFIDENCE_MEDIUM_MIN ?? "45", 10);
  return Number.isFinite(parsed) ? parsed : 45;
}

function getBand(score: number, thresholds?: { highMin?: number | null; mediumMin?: number | null }): ConfidenceBand {
  const highMin = getHighMin(thresholds?.highMin);
  const mediumMin = getMediumMin(thresholds?.mediumMin);
  if (score >= highMin) return "HIGH";
  if (score >= mediumMin) return "MEDIUM";
  return "LOW";
}

function isSpecificUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.length <= 1) return false;
    return (
      path.includes("/events/") ||
      path.includes("/event/") ||
      path.includes("/exhibitions/") ||
      path.includes("/exhibition/") ||
      path.includes("/shows/") ||
      path.includes("/show/") ||
      path.includes("/programme/") ||
      path.includes("/program/") ||
      path.includes("/whats-on/") ||
      path.includes("/on-view/") ||
      /\/\d{4}\/\d{1,2}/.test(path) ||
      /\d{4}-\d{2}-\d{2}/.test(path)
    );
  } catch {
    return false;
  }
}

function hasLetters(input: string): boolean {
  return /[a-z]/i.test(input);
}

function mostlySymbols(input: string): boolean {
  const nonSpace = input.replace(/\s+/g, "");
  if (!nonSpace) return true;
  const symbolChars = nonSpace.replace(/[\p{L}\p{N}]/gu, "").length;
  return symbolChars / nonSpace.length > 0.6;
}

export function sanitizeReasons(reasons: string[]): string[] {
  return reasons
    .map((reason) => reason.trim())
    .filter(Boolean)
    .slice(0, MAX_REASONS)
    .map((reason) => (reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…` : reason));
}

export function computeConfidence(
  candidate: NormalizedExtractedEvent,
  context: { status?: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE"; inherited?: boolean; venueName?: string | null; extractionMethod?: "json_ld" | "openai"; highMin?: number | null; mediumMin?: number | null } = {},
): { score: number; band: ConfidenceBand; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.startAt) {
    score += 20;
    reasons.push("has start time");
  }

  if (candidate.startAt && candidate.endAt && candidate.endAt >= candidate.startAt) {
    score += 10;
    reasons.push("valid end time");
  }

  if (candidate.timezone || (candidate.startAt && candidate.startAt.toISOString().endsWith("Z"))) {
    score += 10;
    reasons.push("timezone stable");
  }

  if ((candidate.locationText?.trim().length ?? 0) >= 4) {
    score += 10;
    reasons.push("has location");
  }

  const descLength = candidate.description?.trim().length ?? 0;
  if (descLength >= 40) {
    score += 10;
    reasons.push("descriptive summary");
  }
  if (descLength > 5000) {
    score -= 10;
    reasons.push("description unusually long");
  }

  const artistCount = candidate.artistNames?.length ?? 0;
  if (artistCount === 1) {
    score += 8;
    reasons.push("named artist present");
  } else if (artistCount >= 2) {
    score += 13;
    reasons.push(`${artistCount} named artists`);
  }

  if (candidate.imageUrl?.trim()) {
    score += 8;
    reasons.push("event image present");
  }

  if (candidate.startAt) {
    const daysUntilStart = (candidate.startAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilStart >= 0 && daysUntilStart <= 90) {
      score += 5;
      reasons.push("starts within 90 days");
    }
  }

  if (isSpecificUrl(candidate.sourceUrl)) {
    score += 10;
    reasons.push("specific source url");
  }

  const title = candidate.title.trim();
  if (title.length >= 5 && title.length <= 120 && hasLetters(title) && !mostlySymbols(title)) {
    score += 10;
    reasons.push("title looks specific");
  }

  if (GENERIC_TITLES.has(title.toLowerCase())) {
    score -= 20;
    reasons.push("generic title");
  }

  const venueName = context.venueName?.trim().toLowerCase();
  if (venueName && title.toLowerCase() === venueName) {
    score -= 15;
    reasons.push("title equals venue name");
  }

  if (!candidate.startAt && descLength < 40 && (candidate.locationText?.trim().length ?? 0) < 4) {
    score -= 20;
    reasons.push("missing key schedule/location signals");
  }

  if (NAV_NOISE.test(title)) {
    score -= 15;
    reasons.push("possible navigation noise title");
  }

  if (context.extractionMethod === "json_ld") {
    score += 20;
    reasons.push("structured json-ld source");
  } else if (context.extractionMethod === "openai") {
    score += 5;
    reasons.push("ai-structured extraction");
  }

  if (context.status === "DUPLICATE") {
    score -= context.inherited ? 0 : 10;
    reasons.push(context.inherited ? "duplicate inherited confidence" : "duplicate confidence penalty");
  }

  const boundedScore = clampScore(score);
  return {
    score: boundedScore,
    band: getBand(boundedScore, { highMin: context.highMin, mediumMin: context.mediumMin }),
    reasons: sanitizeReasons(reasons),
  };
}
