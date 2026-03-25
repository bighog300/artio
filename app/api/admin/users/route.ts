import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminUsersSearch } from "@/lib/admin-users-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminUsersSearch(req, {
    requireAdminUser: requireAdmin,
    appDb: db,
  });
}
