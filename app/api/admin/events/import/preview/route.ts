import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityImportPreview } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  return handleAdminEntityImportPreview(req, "events", { requireAdminUser: requireAdmin, appDb: db });
}
