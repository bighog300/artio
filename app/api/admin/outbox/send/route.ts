import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { sendPendingNotifications } from "@/lib/outbox";
import { parseBody, zodDetails } from "@/lib/validators";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const outboxSendSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const parsedBody = outboxSendSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const result = await sendPendingNotifications({ limit: parsedBody.data.limit });
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Admin role required");
    }
    console.error("admin_outbox_send_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
