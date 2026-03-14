import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportApply } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportApply(req, "events", { requireAdminUser: requireAdmin, appDb: db });
}
