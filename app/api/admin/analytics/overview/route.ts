import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { handleAdminAnalyticsOverview } from "@/lib/admin-analytics-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminAnalyticsOverview(req, { requireAdminUser: requireAdmin, analyticsDb: db as never });
}
