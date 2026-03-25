import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleAdminEntityPatch } from "@/lib/admin-events-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unpublishRequest = new NextRequest(req.url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "APPROVED" }),
  });
  return handleAdminEntityPatch(unpublishRequest, await params, { requireAdminUser: requireAdmin, appDb: db });
}
