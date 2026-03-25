import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityRestore } from "@/lib/admin-venues-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityRestore(req, await params, { requireAdminUser: requireAdmin, appDb: db });
}
