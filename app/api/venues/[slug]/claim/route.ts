import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { createVenueClaim } from "@/lib/venue-claims/service";
import { parseBody, zodDetails } from "@/lib/validators";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const claimSchema = z.object({
  roleAtVenue: z.string().trim().min(2).max(80),
  message: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  noStore();
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;
    const parsed = claimSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const result = await createVenueClaim({
      db: db as never,
      slug,
      userId: user.id,
      roleAtVenue: parsed.data.roleAtVenue,
      message: parsed.data.message,
      notify: async ({ toEmail, token, slug: venueSlug, venueName, expiresAt }) => {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
        const verifyUrl = `${baseUrl}/venues/${encodeURIComponent(venueSlug)}/claim/verify?token=${encodeURIComponent(token)}`;
        await enqueueNotification({
          type: "VENUE_CLAIM_VERIFY",
          toEmail,
          dedupeKey: `venue_claim:${venueSlug}:${token.slice(0, 24)}`,
          payload: { type: "VENUE_CLAIM_VERIFY", venueName, verifyUrl, venueSlug, expiresAt: expiresAt.toISOString() },
        });
      },
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "not_found") return apiError(404, "not_found", "Venue not found");
    if (error instanceof Error && error.message === "rate_limited") return apiError(429, "rate_limited", "Please wait before submitting another claim");
    if (error instanceof Error && error.message === "claim_pending") return apiError(409, "claim_pending", "An active claim already exists for this venue");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
