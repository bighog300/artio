import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleAdminIngestArtworkMerge } from "@/lib/admin-ingest-artwork-merge-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminIngestArtworkMerge(req, await params, {
    requireAdminUser: requireAdmin,
    appDb: db,
  });
}
