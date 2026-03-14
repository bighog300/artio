import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminInviteRevoke } from "@/lib/admin-invites-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAdminInviteRevoke(req, await context.params, { requireAdminUser: requireAdmin, appDb: db });
}
