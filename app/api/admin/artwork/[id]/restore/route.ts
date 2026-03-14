import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { handleAdminEntityRestore } from "@/lib/admin-entities-route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityRestore(req, "artwork", await params, { requireAdminUser: requireAdmin, appDb: db });
}
