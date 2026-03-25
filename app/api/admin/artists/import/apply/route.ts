import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportApply } from "@/lib/admin-artists-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportApply(req, { requireAdminUser: requireAdmin, appDb: db });
}
