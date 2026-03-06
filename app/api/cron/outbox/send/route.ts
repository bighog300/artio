import { extractCronSecret } from "@/lib/cron-auth";
import { NextRequest } from "next/server";
import { sendPendingNotifications } from "@/lib/outbox";
import { runCronOutboxSend } from "@/lib/cron-outbox";
import { getRequestId } from "@/lib/request-id";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";

export const runtime = "nodejs";

async function handleOutbox(req: NextRequest) {
  const settings = await getSiteSettings();

  if (!settings.emailEnabled) {
    return Response.json({ ok: true, skipped: "email_disabled" });
  }

  return runCronOutboxSend(
    extractCronSecret(req.headers),
    ({ limit }) => sendPendingNotifications({ limit: settings.emailOutboxBatchSize ?? limit }),
    {
      requestId: getRequestId(req.headers),
      method: req.method,
      dryRun: req.nextUrl.searchParams.get("dryRun"),
      lockStore: db,
    },
  );
}

export async function GET(req: NextRequest) {
  return handleOutbox(req);
}

export async function POST(req: NextRequest) {
  return handleOutbox(req);
}
