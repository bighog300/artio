export type ApprovalErrorCode =
  | "slug_collision"
  | "image_import_failed"
  | "relink_failed"
  | "db_transaction_failed"
  | "candidate_not_found"
  | "validation_failed"
  | "unknown_error";

export type ImageImportWarningCode =
  | "no_image_found"
  | "image_fetch_failed"
  | "image_download_failed"
  | "image_attach_failed"
  | "image_already_attached"
  | "image_import_disabled"
  | "unknown_image_error";

type ImageImportStatus = "not_attempted" | "imported" | "failed" | "no_image_found";
type CandidatePatchArgs<TData extends Record<string, unknown>> = { where: { id: string }; data: TData };
type CandidatePatchMethod<TData extends Record<string, unknown>> = (args: CandidatePatchArgs<TData>) => Promise<unknown>;

const MAX_APPROVAL_ERROR_LEN = 160;

function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

const APPROVAL_CODES: ReadonlySet<string> = new Set([
  "slug_collision",
  "image_import_failed",
  "relink_failed",
  "db_transaction_failed",
  "candidate_not_found",
  "validation_failed",
  "unknown_error",
]);

const IMAGE_WARNING_CODES: ReadonlySet<string> = new Set([
  "no_image_found",
  "image_fetch_failed",
  "image_download_failed",
  "image_attach_failed",
  "image_already_attached",
  "image_import_disabled",
  "unknown_image_error",
]);

function toErrorText(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return error.message.trim();
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string") return code.trim();
  return "";
}

export function normalizeApprovalError(error: unknown, fallback: ApprovalErrorCode = "unknown_error"): ApprovalErrorCode {
  const raw = toErrorText(error).toLowerCase();
  if (!raw) return fallback;
  if (APPROVAL_CODES.has(raw)) return raw as ApprovalErrorCode;
  if (raw.includes("p2002") || raw.includes("unique constraint") || raw.includes("duplicate key") || raw.includes("slug")) return "slug_collision";
  if (raw.includes("candidate not found") || raw.includes("not found")) return "candidate_not_found";
  if (raw.includes("validation") || raw.includes("invalid")) return "validation_failed";
  if (raw.includes("relink")) return "relink_failed";
  if (raw.includes("transaction") || raw.includes("prisma") || raw.includes("database") || raw.includes("deadlock")) return "db_transaction_failed";
  if (raw.includes("image") && raw.includes("import")) return "image_import_failed";
  return fallback;
}

export function normalizeImageImportWarning(warning: string | null | undefined): ImageImportWarningCode | null {
  if (!warning) return null;
  const cleaned = warning.trim().toLowerCase();
  if (!cleaned) return null;
  if (IMAGE_WARNING_CODES.has(cleaned)) return cleaned as ImageImportWarningCode;
  if (cleaned.includes("disabled")) return "image_import_disabled";
  if (cleaned.includes("already") && cleaned.includes("attach")) return "image_already_attached";
  if (cleaned.includes("no image") || cleaned.includes("discoverable image")) return "no_image_found";
  if (cleaned.includes("download")) return "image_download_failed";
  if (cleaned.includes("fetch")) return "image_fetch_failed";
  if (cleaned.includes("attach") || cleaned.includes("asset")) return "image_attach_failed";
  if (cleaned.includes("image")) return "unknown_image_error";
  return "unknown_image_error";
}

export function normalizeImageImportError(error: unknown, fallback: ImageImportWarningCode = "unknown_image_error"): ImageImportWarningCode {
  const raw = toErrorText(error).toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("download")) return "image_download_failed";
  if (raw.includes("fetch") || raw.includes("timeout") || raw.includes("network")) return "image_fetch_failed";
  if (raw.includes("attach") || raw.includes("asset") || raw.includes("blob")) return "image_attach_failed";
  return fallback;
}

async function patchArtistCandidate<TData extends Record<string, unknown>>(
  db: { ingestExtractedArtist?: { updateMany?: CandidatePatchMethod<TData>; update?: CandidatePatchMethod<TData> } },
  candidateId: string,
  data: TData,
) {
  if (!db.ingestExtractedArtist) return;
  if (db.ingestExtractedArtist.updateMany) {
    await db.ingestExtractedArtist.updateMany({ where: { id: candidateId }, data });
    return;
  }
  if (db.ingestExtractedArtist.update) {
    await db.ingestExtractedArtist.update({ where: { id: candidateId }, data });
  }
}

async function patchArtworkCandidate<TData extends Record<string, unknown>>(
  db: { ingestExtractedArtwork?: { updateMany?: CandidatePatchMethod<TData>; update?: CandidatePatchMethod<TData> } },
  candidateId: string,
  data: TData,
) {
  if (!db.ingestExtractedArtwork) return;
  if (db.ingestExtractedArtwork.updateMany) {
    await db.ingestExtractedArtwork.updateMany({ where: { id: candidateId }, data });
    return;
  }
  if (db.ingestExtractedArtwork.update) {
    await db.ingestExtractedArtwork.update({ where: { id: candidateId }, data });
  }
}

export async function markArtistApprovalAttempt(
  db: { ingestExtractedArtist?: { updateMany?: (args: { where: { id: string }; data: { lastApprovalAttemptAt: Date } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { lastApprovalAttemptAt: Date } }) => Promise<unknown> } },
  candidateId: string,
) {
  await patchArtistCandidate(db, candidateId, { lastApprovalAttemptAt: new Date() });
}

export async function markArtistApprovalFailure(
  db: { ingestExtractedArtist?: { updateMany?: (args: { where: { id: string }; data: { lastApprovalError: string } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { lastApprovalError: string } }) => Promise<unknown> } },
  candidateId: string,
  error: ApprovalErrorCode,
) {
  await patchArtistCandidate(db, candidateId, { lastApprovalError: truncate(error, MAX_APPROVAL_ERROR_LEN) });
}

export async function markArtworkApprovalAttempt(
  db: { ingestExtractedArtwork?: { updateMany?: (args: { where: { id: string }; data: { lastApprovalAttemptAt: Date } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { lastApprovalAttemptAt: Date } }) => Promise<unknown> } },
  candidateId: string,
) {
  await patchArtworkCandidate(db, candidateId, { lastApprovalAttemptAt: new Date() });
}

export async function markArtworkApprovalFailure(
  db: { ingestExtractedArtwork?: { updateMany?: (args: { where: { id: string }; data: { lastApprovalError: string } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { lastApprovalError: string } }) => Promise<unknown> } },
  candidateId: string,
  error: ApprovalErrorCode,
) {
  await patchArtworkCandidate(db, candidateId, { lastApprovalError: truncate(error, MAX_APPROVAL_ERROR_LEN) });
}

export async function markArtistImageImportOutcome(
  db: { ingestExtractedArtist?: { updateMany?: (args: { where: { id: string }; data: { imageImportStatus: ImageImportStatus; imageImportWarning: string | null } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { imageImportStatus: ImageImportStatus; imageImportWarning: string | null } }) => Promise<unknown> } },
  candidateId: string,
  status: ImageImportStatus,
  warning: string | null,
) {
  await patchArtistCandidate(db, candidateId, {
    imageImportStatus: status,
    imageImportWarning: normalizeImageImportWarning(warning),
  });
}

export async function markArtworkImageImportOutcome(
  db: { ingestExtractedArtwork?: { updateMany?: (args: { where: { id: string }; data: { imageImportStatus: ImageImportStatus; imageImportWarning: string | null } }) => Promise<unknown>; update?: (args: { where: { id: string }; data: { imageImportStatus: ImageImportStatus; imageImportWarning: string | null } }) => Promise<unknown> } },
  candidateId: string,
  status: ImageImportStatus,
  warning: string | null,
) {
  await patchArtworkCandidate(db, candidateId, {
    imageImportStatus: status,
    imageImportWarning: normalizeImageImportWarning(warning),
  });
}
