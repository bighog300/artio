import type { Prisma } from "@prisma/client";

export type StartAtIdCursor = { startAt: Date; id: string };

export const START_AT_ID_ORDER_BY: Prisma.EventOrderByWithRelationInput[] = [{ startAt: "asc" }, { id: "asc" }];

export type UpdatedAtIdCursor = { updatedAt: Date; id: string };

export const UPDATED_AT_ID_DESC_ORDER_BY: Prisma.ArtworkOrderByWithRelationInput[] = [{ updatedAt: "desc" }, { id: "desc" }];
export const UPDATED_AT_ID_ASC_ORDER_BY: Prisma.ArtworkOrderByWithRelationInput[] = [{ updatedAt: "asc" }, { id: "asc" }];

export function buildStartAtIdCursorPredicate(cursor?: StartAtIdCursor | null): Prisma.EventWhereInput[] {
  if (!cursor) return [];
  return [{ OR: [{ startAt: { gt: cursor.startAt } }, { startAt: cursor.startAt, id: { gt: cursor.id } }] }];
}

export function buildUpdatedAtIdCursorPredicate(
  cursor?: UpdatedAtIdCursor | null,
  direction: "asc" | "desc" = "desc",
): Prisma.ArtworkWhereInput[] {
  if (!cursor) return [];
  if (direction === "asc") {
    return [{ OR: [{ updatedAt: { gt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { gt: cursor.id } }] }];
  }
  return [{ OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] }];
}
