import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { name } = await params;
    const job = await db.cronJob.findUnique({ where: { name } });
    if (!job) return apiError(404, "not_found", "Cron job not found");

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const url = new URL(job.endpoint, appBaseUrl).toString();

    let status = 500;
    let ok = false;
    let message = "";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
      status = response.status;
      ok = response.ok;
      message = ((await response.text()) || response.statusText || "").slice(0, 200);
    } catch (error) {
      message = error instanceof Error ? error.message.slice(0, 200) : "request_failed";
    }

    await db.cronJob.update({
      where: { id: job.id },
      data: {
        lastFiredAt: new Date(),
        lastStatus: ok ? "success" : "error",
        lastMessage: message,
      },
    });

    return NextResponse.json({ ok, status, message });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    console.error("admin_cron_name_run_now_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
