import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { handleAdminEntityArchive } from "@/lib/admin-artworks-route";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityArchive(req, await params, { requireAdminUser: requireAdmin, appDb: db });
}
