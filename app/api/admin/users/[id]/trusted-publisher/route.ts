import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminTrustedPublisherUpdate } from "@/lib/admin-users-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return handleAdminTrustedPublisherUpdate(req, params, {
    requireAdminUser: requireAdmin,
    appDb: db,
  });
}
