import { NextRequest } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin";
import { handleAdminJobRun } from "@/lib/admin-jobs-run-route";
import { runJob } from "@/lib/jobs/run-job";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleAdminJobRun(req, {
    requireAdminUser: () => requireAdmin({ redirectOnFail: false }),
    runJobFn: runJob,
    logAdminAction,
  });
}
