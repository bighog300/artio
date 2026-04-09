import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const bulkPriceSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        priceAmount: z.number().int().min(0).max(100_000_00),
        currency: z.string().length(3).toUpperCase(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(req: Request) {
  noStore();

  try {
    await requireAdmin();

    const json = await req.json();
    const parsed = bulkPriceSchema.safeParse(json);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid request body", parsed.error.flatten());

    await db.$transaction(
      parsed.data.items.map((item) =>
        db.artwork.updateMany({
          where: { id: item.id, deletedAt: null },
          data: { priceAmount: item.priceAmount, currency: item.currency },
        }),
      ),
    );

    return Response.json({ updated: parsed.data.items.length });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    console.error("admin_artwork_bulk_price_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
