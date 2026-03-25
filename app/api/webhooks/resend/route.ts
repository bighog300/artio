import { db } from "@/lib/db";
import { createHash, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

type ResendWebhookEvent = {
  type: string;
  data?: {
    tags?: Array<{ name?: string; value?: string }>;
  };
};

function getCampaignId(event: ResendWebhookEvent) {
  const tag = event.data?.tags?.find((entry) => entry.name === "campaignId" && typeof entry.value === "string");
  return tag?.value;
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = createHash("sha256").update(a).digest();
  const bBuf = createHash("sha256").update(b).digest();
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "missing_webhook_secret" }, { status: 500 });
  }

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!provided || !safeCompare(provided, secret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = (await req.json()) as ResendWebhookEvent;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const campaignId = getCampaignId(event);
  if (!campaignId) {
    return Response.json({ ok: true });
  }

  if (event.type === "email.delivered") {
    await db.emailCampaign.updateMany({
      where: { id: campaignId },
      data: { deliveredCount: { increment: 1 } },
    });
  }

  if (event.type === "email.opened") {
    await db.emailCampaign.updateMany({
      where: { id: campaignId },
      data: { openedCount: { increment: 1 } },
    });
  }

  if (event.type === "email.bounced") {
    await db.emailCampaign.updateMany({
      where: { id: campaignId },
      data: { bouncedCount: { increment: 1 } },
    });
  }

  return Response.json({ ok: true });
}
