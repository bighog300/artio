import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleAdminInviteAccept } from "@/lib/admin-invite-accept-route";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminInviteAccept(req, { requireUser, appDb: db });
}
