import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { handleAdminEntityArchive } from "@/lib/admin-entities-route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityArchive(req, "artwork", await params, { requireAdminUser: requireAdmin, appDb: db });
}
