export type ArtworkCompletenessIssueCode =
  | "MISSING_TITLE"
  | "MISSING_IMAGE"
  | "MISSING_DESCRIPTION"
  | "MISSING_MEDIUM"
  | "MISSING_YEAR"
  | "MISSING_DIMENSIONS"
  | "MISSING_PROVENANCE";

export type ArtworkCompletenessIssue = {
  code: ArtworkCompletenessIssueCode;
  label: string;
  field: "title" | "images" | "description" | "medium" | "year" | "dimensions" | "provenance";
  hrefFragment?: "title" | "images" | "description";
};

export type ArtworkCompletenessInput = {
  title: string | null;
  description: string | null;
  medium: string | null;
  year: number | null;
  featuredAssetId: string | null;
  dimensions: string | null;
  provenance: string | null;
};

export type ArtworkCompletenessFlag =
  | "MISSING_IMAGE"
  | "LOW_CONFIDENCE_METADATA"
  | "INCOMPLETE";

export type ArtworkCompletenessResult = {
  scorePct: number;
  required: { ok: boolean; issues: ArtworkCompletenessIssue[] };
  recommended: { ok: boolean; issues: ArtworkCompletenessIssue[] };
  flags: ArtworkCompletenessFlag[];
};

export function computeArtworkCompleteness(artwork: ArtworkCompletenessInput, imageCount: number): ArtworkCompletenessResult {
  const requiredIssues: ArtworkCompletenessIssue[] = [];
  const recommendedIssues: ArtworkCompletenessIssue[] = [];

  if ((artwork.title ?? "").trim().length < 2) {
    requiredIssues.push({
      code: "MISSING_TITLE",
      label: "Add a title (at least 2 characters).",
      field: "title",
      hrefFragment: "title",
    });
  }

  const hasImage = Boolean(artwork.featuredAssetId) || imageCount > 0;
  if (!hasImage) {
    requiredIssues.push({
      code: "MISSING_IMAGE",
      label: "Add at least one image.",
      field: "images",
      hrefFragment: "images",
    });
  }

  if ((artwork.description ?? "").trim().length < 20) {
    recommendedIssues.push({
      code: "MISSING_DESCRIPTION",
      label: "Add a description (20+ characters recommended).",
      field: "description",
      hrefFragment: "description",
    });
  }

  if (!(artwork.medium ?? "").trim()) {
    recommendedIssues.push({
      code: "MISSING_MEDIUM",
      label: "Add a medium.",
      field: "medium",
    });
  }

  if (!artwork.year) {
    recommendedIssues.push({
      code: "MISSING_YEAR",
      label: "Add a year.",
      field: "year",
    });
  }

  if (!(artwork.dimensions ?? "").trim()) {
    recommendedIssues.push({
      code: "MISSING_DIMENSIONS",
      label: "Add dimensions.",
      field: "dimensions",
    });
  }

  if (!(artwork.provenance ?? "").trim()) {
    recommendedIssues.push({
      code: "MISSING_PROVENANCE",
      label: "Add provenance.",
      field: "provenance",
    });
  }

  const checksTotal = 7;
  const checksPassed = checksTotal - requiredIssues.length - recommendedIssues.length;

  const scorePct = Math.round((checksPassed / checksTotal) * 100);
  const flags: ArtworkCompletenessFlag[] = [];
  if (!hasImage) flags.push("MISSING_IMAGE");
  if (scorePct < 60) flags.push("INCOMPLETE");
  if (requiredIssues.length > 0) flags.push("LOW_CONFIDENCE_METADATA");

  return {
    scorePct,
    required: { ok: requiredIssues.length === 0, issues: requiredIssues },
    recommended: { ok: recommendedIssues.length === 0, issues: recommendedIssues },
    flags,
  };
}
