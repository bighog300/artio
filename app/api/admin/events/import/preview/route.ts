import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportPreview } from "@/lib/admin-events-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportPreview(req, { requireAdminUser: requireAdmin, appDb: db });
}
