import crypto from "node:crypto";
import { db } from "@/lib/db";
import { captureException, captureMessage } from "@/lib/monitoring";

export type AlertPayload = {
  severity: "info" | "warn" | "error";
  title: string;
  body: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
};

function signatureFor(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function getAlertSettings() {
  if (process.env.ALERT_WEBHOOK_URL) {
    return {
      webhookUrl: process.env.ALERT_WEBHOOK_URL,
      webhookSecret: process.env.ALERT_WEBHOOK_SECRET,
    };
  }

  const settings = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: { alertWebhookUrl: true, alertWebhookSecret: true },
  }).catch(() => null);

  return {
    webhookUrl: settings?.alertWebhookUrl ?? process.env.ALERT_WEBHOOK_URL,
    webhookSecret: settings?.alertWebhookSecret ?? process.env.ALERT_WEBHOOK_SECRET,
  };
}

export async function sendAlert(payload: AlertPayload) {
  const { webhookUrl, webhookSecret } = await getAlertSettings();

  if (!webhookUrl) {
    captureMessage("alert_fallback_log", { level: payload.severity, ...payload });
    return;
  }

  const body = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  });

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (webhookSecret) {
    headers["x-alert-signature"] = signatureFor(body, webhookSecret);
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      captureMessage("alert_delivery_failed", {
        level: "error",
        alertTitle: payload.title,
        status: response.status,
      });
    }
  } catch (error) {
    captureException(error, { alertTitle: payload.title, route: "alert_sink" });
  }
}
