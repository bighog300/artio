// This route is triggered by an external uptime/ping service and is intentionally not
// registered in vercel.json.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { runSchedulerTick } from "@/lib/cron-scheduler/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleTick(req: NextRequest) {
  const authFailure = validateCronRequest(extractCronSecret(req.headers), {
    route: "/api/cron/tick",
    method: req.method,
  });
  if (authFailure) return authFailure;

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const result = await runSchedulerTick({
    db,
    appBaseUrl,
    cronSecret: process.env.CRON_SECRET!,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return handleTick(req);
}

export async function POST(req: NextRequest) {
  return handleTick(req);
}
