import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { handleAdminAnalyticsDrilldown } from "@/lib/admin-analytics-drilldown-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminAnalyticsDrilldown(req, { requireAdminUser: requireAdmin, analyticsDb: db as never });
}
