import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityExport } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  return handleAdminEntityExport(req, "artists", { requireAdminUser: requireAdmin, appDb: db });
}
