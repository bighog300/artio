import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function PATCH(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid outbox id");

    const updated = await db.notificationOutbox.update({
      where: { id: parsedParams.data.id },
      data: {
        status: "PENDING",
        errorMessage: null,
        nextRetryAt: null,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    console.error("admin_outbox_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
