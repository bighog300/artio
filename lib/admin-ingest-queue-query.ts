import { Prisma } from "@prisma/client";

export type QueueApprovalFilter = "all" | "failed" | "attempted" | "not_attempted";
export type QueueImageFilter = "all" | "failed" | "no_image_found" | "imported" | "not_attempted";
export type QueueSort = "updated_desc" | "approval_attempt_desc";
export type QueueStatus = "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";

type QueueQueryParams = {
  status: QueueStatus;
  band: string | null;
  approval: QueueApprovalFilter;
  image: QueueImageFilter;
  reason: string;
  sort: QueueSort;
  page: number;
};

function readParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseQueueQueryParams(searchParams: URLSearchParams): QueueQueryParams {
  const rawStatus = readParam(searchParams.get("status"));
  const rawApproval = readParam(searchParams.get("approval"));
  const rawImage = readParam(searchParams.get("image"));
  const rawReason = readParam(searchParams.get("reason"));
  const rawSort = readParam(searchParams.get("sort"));
  const rawBand = readParam(searchParams.get("band"));
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);

  const status: QueueStatus =
    rawStatus === "APPROVED" || rawStatus === "REJECTED" || rawStatus === "DUPLICATE"
      ? rawStatus
      : "PENDING";

  const approval: QueueApprovalFilter =
    rawApproval === "failed" || rawApproval === "attempted" || rawApproval === "not_attempted"
      ? rawApproval
      : "all";

  const image: QueueImageFilter =
    rawImage === "failed" ||
    rawImage === "no_image_found" ||
    rawImage === "imported" ||
    rawImage === "not_attempted"
      ? rawImage
      : "all";

  const sort: QueueSort = rawSort === "approval_attempt_desc" ? "approval_attempt_desc" : "updated_desc";

  return {
    status,
    band: rawBand,
    approval,
    image,
    reason: rawReason ?? "",
    sort,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function getQueueOrderBy(sort: QueueSort): Array<Record<string, "desc">> {
  if (sort === "approval_attempt_desc") {
    return [{ lastApprovalAttemptAt: "desc" }, { updatedAt: "desc" }];
  }
  return [{ updatedAt: "desc" }];
}

function buildCommonQueueWhere(
  status: QueueStatus,
  band: string | null,
  approval: QueueApprovalFilter,
  image: QueueImageFilter,
  reason: string,
): Prisma.IngestExtractedArtistWhereInput {
  const and: Prisma.IngestExtractedArtistWhereInput[] = [];

  if (approval === "failed") {
    and.push({ lastApprovalError: { not: null } });
  } else if (approval === "attempted") {
    and.push({ lastApprovalAttemptAt: { not: null } }, { lastApprovalError: null });
  } else if (approval === "not_attempted") {
    and.push({ lastApprovalAttemptAt: null });
  }

  if (image === "failed" || image === "no_image_found" || image === "imported") {
    and.push({ imageImportStatus: image });
  } else if (image === "not_attempted") {
    and.push({
      OR: [{ imageImportStatus: null }, { imageImportStatus: "not_attempted" }],
    });
  }

  if (reason.trim()) {
    and.push({
      OR: [
        { lastApprovalError: { contains: reason.trim(), mode: "insensitive" } },
        { imageImportWarning: { contains: reason.trim(), mode: "insensitive" } },
      ],
    });
  }

  return {
    status,
    ...(band ? { confidenceBand: band } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export function buildArtistQueueWhere(params: QueueQueryParams): Prisma.IngestExtractedArtistWhereInput {
  return buildCommonQueueWhere(params.status, params.band, params.approval, params.image, params.reason);
}

export function buildArtworkQueueWhere(params: QueueQueryParams): Prisma.IngestExtractedArtworkWhereInput {
  return buildCommonQueueWhere(
    params.status,
    params.band,
    params.approval,
    params.image,
    params.reason,
  ) as Prisma.IngestExtractedArtworkWhereInput;
}
