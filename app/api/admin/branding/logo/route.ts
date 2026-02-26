import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleAdminBrandingLogoGet } from "@/lib/admin-branding-logo-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminBrandingLogoGet(req, { requireAdminUser: requireAdmin });
}
