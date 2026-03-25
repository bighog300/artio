import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportApply } from "@/lib/admin-events-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportApply(req, { requireAdminUser: requireAdmin, appDb: db });
}
