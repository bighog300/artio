import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { handleAdminIngestRestore } from "@/lib/admin-ingest-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminIngestRestore(req, await params, {
    requireEditorUser: requireAdmin,
    appDb: db,
    logAction: logAdminAction,
  });
}
