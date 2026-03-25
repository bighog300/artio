import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportPreview } from "@/lib/admin-venues-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportPreview(req, { requireAdminUser: requireAdmin, appDb: db });
}
