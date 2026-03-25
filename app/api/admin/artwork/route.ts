import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { handleAdminEntityList } from "@/lib/admin-artworks-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityList(req, { requireAdminUser: requireAdmin, appDb: db });
}
