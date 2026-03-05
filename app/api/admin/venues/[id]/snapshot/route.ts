import { NextRequest } from "next/server";
import { withAdminRoute } from "@/lib/admin-route";
import { handleAdminVenuePatch } from "@/lib/admin-venue-patch-route";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminRoute(async ({ actorEmail }) =>
    handleAdminVenuePatch(req, await params, actorEmail)
  );
}
