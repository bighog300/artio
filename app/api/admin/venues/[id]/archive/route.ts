import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityArchive } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityArchive(req, "venues", await params, { requireAdminUser: requireAdmin, appDb: db });
}
