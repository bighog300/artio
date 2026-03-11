import { buildStartAtIdCursorPredicate, type StartAtIdCursor } from "@/lib/cursor-predicate";

export type NearbyCursorInput = { cursor?: StartAtIdCursor | null; from: Date; to: Date; hiddenEventIds?: string[] };

export function buildNearbyEventsFilters({ cursor, from, to, hiddenEventIds }: NearbyCursorInput) {
  const hiddenIds = hiddenEventIds?.filter((id) => id.length > 0) ?? [];
  return {
    startAt: { gte: from, lte: to },
    cursorFilters: buildStartAtIdCursorPredicate(cursor),
    hiddenFilters: hiddenIds.length ? [{ id: { notIn: hiddenIds } }] : [],
  };
}

export function sortAndPaginateByStartAtId<T extends { id: string; startAt: Date }>(items: T[], limit: number, cursor?: StartAtIdCursor | null) {
  const ordered = items.slice().sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));
  const filtered = cursor
    ? ordered.filter((item) => item.startAt > cursor.startAt || (item.startAt.getTime() === cursor.startAt.getTime() && item.id > cursor.id))
    : ordered;
  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  return {
    items: page,
    nextCursor: hasMore ? { id: page[page.length - 1].id, startAt: page[page.length - 1].startAt } : null,
  };
}
