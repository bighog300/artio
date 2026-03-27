import type { ContentStatus, Prisma } from "@prisma/client";

export type GapFilter = "ALL" | "MISSING_BIO" | "MISSING_DESCRIPTION" | "MISSING_IMAGE";
export type StatusFilter = "ALL" | "DRAFT" | "ONBOARDING" | "IN_REVIEW" | "PUBLISHED";

const ALL_STATUSES: Array<"DRAFT" | "ONBOARDING" | "IN_REVIEW" | "PUBLISHED"> = [
  "DRAFT",
  "ONBOARDING",
  "IN_REVIEW",
  "PUBLISHED",
];

function baseStatus(statusFilter: StatusFilter): { status?: ContentStatus | { in: ContentStatus[] } } {
  if (statusFilter === "ALL") {
    return { status: { in: ALL_STATUSES } };
  }

  return { status: statusFilter };
}

export function buildArtistWhere(args: { gapFilter: GapFilter; statusFilter: StatusFilter }): Prisma.ArtistWhereInput {
  const where: Prisma.ArtistWhereInput = {
    deletedAt: null,
    ...baseStatus(args.statusFilter),
  };

  if (args.gapFilter === "MISSING_BIO") {
    where.OR = [{ bio: null }, { bio: "" }];
  } else if (args.gapFilter === "MISSING_IMAGE") {
    where.featuredAssetId = null;
  }

  return where;
}

export function buildArtworkWhere(args: { gapFilter: GapFilter; statusFilter: StatusFilter }): Prisma.ArtworkWhereInput {
  const where: Prisma.ArtworkWhereInput = {
    deletedAt: null,
    ...baseStatus(args.statusFilter),
  };

  if (args.gapFilter === "MISSING_DESCRIPTION") {
    where.OR = [{ description: null }, { description: "" }];
  } else if (args.gapFilter === "MISSING_IMAGE") {
    where.featuredAssetId = null;
  }

  return where;
}

export function buildVenueWhere(args: { gapFilter: GapFilter; statusFilter: StatusFilter }): Prisma.VenueWhereInput {
  const where: Prisma.VenueWhereInput = {
    deletedAt: null,
    ...baseStatus(args.statusFilter),
  };

  if (args.gapFilter === "MISSING_DESCRIPTION") {
    where.OR = [{ description: null }, { description: "" }];
  } else if (args.gapFilter === "MISSING_IMAGE") {
    where.featuredAssetId = null;
  }

  return where;
}

export function buildEventWhere(args: { gapFilter: GapFilter; statusFilter: StatusFilter }): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    ...baseStatus(args.statusFilter),
  };

  if (args.gapFilter === "MISSING_DESCRIPTION") {
    where.OR = [{ description: null }, { description: "" }];
  } else if (args.gapFilter === "MISSING_IMAGE") {
    where.featuredAssetId = null;
  }

  return where;
}
