export type ArtistCompletenessFlag =
  | "MISSING_IMAGE"
  | "MISSING_BIO"
  | "INCOMPLETE";

export type ArtistCompletenessResult = {
  score: number;
  scorePct: number;
  missing: string[];
  flags: ArtistCompletenessFlag[];
};

export function computeArtistCompleteness(artist: {
  name?: string | null;
  bio: string | null;
  featuredAssetId?: string | null;
  websiteUrl: string | null;
  mediums: string[];
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  nationality?: string | null;
  birthYear?: number | null;
}): ArtistCompletenessResult {
  const checksTotal = 7;
  let checksPassed = 0;

  if ((artist.name ?? "").trim().length >= 2) {
    checksPassed += 1;
  }

  const bioLength = (artist.bio ?? "").trim().length;
  if (bioLength >= 200) {
    checksPassed += 2;
  } else if (bioLength >= 50) {
    checksPassed += 1;
  }

  if (artist.featuredAssetId) {
    checksPassed += 1;
  }

  if ((artist.websiteUrl ?? "").trim()) {
    checksPassed += 1;
  }

  if (artist.mediums.length > 0) {
    checksPassed += 1;
  }

  if ((artist.nationality ?? "").trim()) {
    checksPassed += 1;
  }

  if (artist.birthYear != null && artist.birthYear >= 1850 && artist.birthYear <= 2005) {
    checksPassed += 1;
  }

  const scorePct = Math.round((checksPassed / checksTotal) * 100);
  const flags: ArtistCompletenessFlag[] = [];

  if (!artist.featuredAssetId) flags.push("MISSING_IMAGE");
  if (bioLength < 50) flags.push("MISSING_BIO");
  if (scorePct < 60) flags.push("INCOMPLETE");

  const missing: string[] = [];
  if (bioLength < 50) missing.push("bio");
  if (!artist.featuredAssetId) missing.push("image");
  if (!(artist.websiteUrl ?? "").trim()) missing.push("website");
  if (artist.mediums.length === 0) missing.push("mediums");
  if (!(artist.nationality ?? "").trim()) missing.push("nationality");
  if (!(artist.birthYear != null && artist.birthYear >= 1850 && artist.birthYear <= 2005)) missing.push("birth year");

  return { score: scorePct, scorePct, missing, flags };
}
