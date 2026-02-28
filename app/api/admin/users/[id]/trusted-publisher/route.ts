import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleAdminTrustedPublisherUpdate } from "@/lib/admin-users-route";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return handleAdminTrustedPublisherUpdate(req, params, {
    requireAdminUser: requireAdmin,
    appDb: db,
  });
}
