import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityExport } from "@/lib/admin-venues-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityExport(req, { requireAdminUser: requireAdmin, appDb: db });
}
