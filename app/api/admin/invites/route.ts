import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminInviteCreate, handleAdminInvitesList } from "@/lib/admin-invites-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminInviteCreate(req, { requireAdminUser: requireAdmin, appDb: db });
}

export async function GET(req: NextRequest) {
  return handleAdminInvitesList(req, { requireAdminUser: requireAdmin, appDb: db });
}
