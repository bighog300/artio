import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminIngestArtworkMerge } from "@/lib/admin-ingest-artwork-merge-route";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminIngestArtworkMerge(req, await params, {
    requireAdminUser: requireAdmin,
    appDb: db,
  });
}
