export function scoreArtworkCandidate(candidate: {
  title: string;
  medium?: string | null;
  year?: number | null;
  dimensions?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  artistName?: string | null;
}): { score: number; band: "HIGH" | "MEDIUM" | "LOW"; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.title?.trim().length >= 2) {
    score += 30;
    reasons.push("title present");
  }

  if (candidate.medium?.trim()) {
    score += 20;
    reasons.push("medium present");
  }

  if (candidate.imageUrl?.trim()) {
    score += 15;
    reasons.push("image url present");
  }

  if (candidate.year != null && candidate.year >= 1800 && candidate.year <= 2030) {
    score += 10;
    reasons.push("plausible year");
  }

  if (candidate.artistName?.trim()) {
    score += 10;
    reasons.push("artist name present");
  }

  if ((candidate.description?.trim().length ?? 0) > 30) {
    score += 10;
    reasons.push("description length > 30");
  }

  if (candidate.dimensions?.trim()) {
    score += 5;
    reasons.push("dimensions present");
  }

  const band = score >= 75 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  return { score, band, reasons };
}
