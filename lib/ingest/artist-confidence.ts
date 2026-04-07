const KNOWN_MEDIUMS = [
  "painting", "sculpture", "photography", "drawing", "printmaking",
  "ceramics", "textile", "installation", "video", "performance", "digital", "mixed media",
  "oil", "watercolour", "watercolor", "acrylic", "charcoal", "pastel", "lithograph",
  "screenprint", "etching", "bronze", "marble", "glass", "wood", "paper",
] as const;

const INSTITUTION_SUFFIX = /(gallery|museum|foundation|institute|centre|center|trust|society)\s*$/i;

export function scoreArtistCandidate(candidate: {
  bio?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  mediums: string[];
  birthYear?: number | null;
  name: string;
  searchQuery: string;
  wikipediaMatch: boolean;
}): { score: number; band: "HIGH" | "MEDIUM" | "LOW"; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const bioLength = candidate.bio?.trim().length ?? 0;
  if (bioLength > 200) {
    score += 20;
    reasons.push("long bio (>200 chars)");
  } else if (bioLength > 50) {
    score += 10;
    reasons.push("bio present (>50 chars)");
  }

  if (candidate.wikipediaMatch) {
    score += 20;
    reasons.push("search results include wikipedia");
  }

  if (candidate.websiteUrl?.trim()) {
    score += 15;
    reasons.push("has website url");
  }

  if (candidate.instagramUrl?.trim()) {
    score += 10;
    reasons.push("has instagram url");
  }

  if (candidate.twitterUrl?.trim()) {
    score += 5;
    reasons.push("has twitter url");
  }

  const hasKnownMedium = candidate.mediums.some((medium) => {
    const normalized = medium.trim().toLowerCase();
    return KNOWN_MEDIUMS.some((known) => normalized.includes(known));
  });

  if (hasKnownMedium) {
    score += 10;
    reasons.push("includes known art medium");
  }

  if (candidate.birthYear != null && candidate.birthYear >= 1850 && candidate.birthYear <= 2005) {
    score += 5;
    reasons.push("plausible birth year");
  }

  if (INSTITUTION_SUFFIX.test(candidate.name.trim())) {
    score -= 15;
    reasons.push(`name looks like institution/venue (${candidate.searchQuery})`);
  }

  const clampedScore = Math.min(100, Math.max(0, score));
  const band = clampedScore >= 70 ? "HIGH" : clampedScore >= 50 ? "MEDIUM" : "LOW";

  return { score: clampedScore, band, reasons };
}
