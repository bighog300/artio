import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { handleAdminCurationHomeOrder } from "@/lib/admin-curation-home-order-route";

export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  return handleAdminCurationHomeOrder(req, {
    requireAdminUser: requireAdmin,
    getBefore: (orderedIds) => db.curatedCollection.findMany({ where: { id: { in: orderedIds } }, select: { id: true, homeRank: true } }),
    updateOrder: async (orderedIds, resetOthers) => {
      await db.$transaction(async (tx) => {
        for (const [index, id] of orderedIds.entries()) {
          await tx.curatedCollection.update({ where: { id }, data: { homeRank: index + 1 } });
        }
        if (resetOthers) {
          await tx.curatedCollection.updateMany({ where: { id: { notIn: orderedIds } }, data: { homeRank: null } });
        }
      });
    },
    getAfter: (orderedIds) => db.curatedCollection.findMany({ where: { id: { in: orderedIds } }, orderBy: [{ homeRank: "asc" }, { updatedAt: "desc" }, { id: "asc" }], select: { id: true, title: true, homeRank: true, showOnHome: true, updatedAt: true } }),
    logAction: ({ actorEmail, before, after, req }) => logAdminAction({ actorEmail, action: "ADMIN_COLLECTION_HOME_ORDER_UPDATED", targetType: "curated_collection", metadata: { before, after }, req }),
  });
}
