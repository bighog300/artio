import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleAdminEntityList } from "@/lib/admin-entities-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityList(req, "artwork", { requireAdminUser: requireAdmin, appDb: db });
}
