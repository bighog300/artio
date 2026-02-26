import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleAdminBrandingLogoClear } from "@/lib/admin-branding-logo-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminBrandingLogoClear(req, { requireAdminUser: requireAdmin });
}
