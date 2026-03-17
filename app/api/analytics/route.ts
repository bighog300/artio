import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/server";
import { getRequestId } from "@/lib/request-id";
import { captureMessage } from "@/lib/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 50 * 1024;
const FORBIDDEN_PROP_KEYS = [
  /query/i,
  /^lat$/i,
  /^lng$/i,
  /email/i,
  /^user_?id$/i,
  /user.?name/i,
  /full.?name/i,
  /first.?name/i,
  /last.?name/i,
  /phone/i,
  /address/i,
  /^ip$/i,
];

const analyticsSchema = z.object({
  name: z.string().min(1).max(80),
  props: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
  ts: z.string().datetime(),
  path: z.string().max(250),
  sid: z.string().uuid().optional(),
  referrer: z.string().max(250).optional(),
}).strict();

function hasForbiddenProps(props?: Record<string, string | number | boolean>) {
  if (!props) return false;
  return Object.keys(props).some((key) => FORBIDDEN_PROP_KEYS.some((pattern) => pattern.test(key)));
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "test") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const route = "/api/analytics";
  const requestId = getRequestId(req.headers);
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    captureMessage("analytics_rejected", { level: "warn", route, requestId, userScope: false, reason: "payload_too_large" });
    return new NextResponse(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  const json = await req.json().catch(() => null);
  const parsed = analyticsSchema.safeParse(json);
  if (!parsed.success || hasForbiddenProps(parsed.data.props)) {
    captureMessage("analytics_rejected", { level: "warn", route, requestId, userScope: false, reason: "invalid_payload", name: parsed.success ? parsed.data.name : "unknown" });
    return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  trackServerEvent(parsed.data);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
