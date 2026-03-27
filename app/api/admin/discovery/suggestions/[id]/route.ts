import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const parsedBody = patchSchema.safeParse(await req.json());
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", parsedBody.error.flatten());

    const suggestion = await db.discoveryTemplateSuggestion.findUnique({ where: { id: parsedParams.data.id } });
    if (!suggestion) return apiError(404, "not_found", "Suggestion not found");

    const updated = parsedBody.data.action === "approve"
      ? await db.discoveryTemplateSuggestion.update({
          where: { id: suggestion.id },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
          },
        })
      : await db.discoveryTemplateSuggestion.update({
          where: { id: suggestion.id },
          data: {
            status: "DISMISSED",
            dismissedAt: new Date(),
          },
        });

    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
