import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { resendClaimToken } from "@/lib/venue-claims/service";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;

    const result = await resendClaimToken({ db: db as never, slug, userId: user.id });
    if ("error" in result && result.error === "not_found") return apiError(404, "not_found", "No pending claim found");
    if ("error" in result && result.error === "cooldown") return apiError(429, "cooldown", "Please wait before requesting another email");

    const venue = await db.venue.findUnique({ where: { slug }, select: { name: true, slug: true } });
    if (!venue) return apiError(404, "not_found", "Venue not found");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/venues/${encodeURIComponent(slug)}/claim/verify?token=${encodeURIComponent(result.token)}`;
    await enqueueNotification({
      type: "VENUE_CLAIM_VERIFY",
      toEmail: result.toEmail,
      dedupeKey: `venue_claim_resend:${result.claimId}:${result.token.slice(0, 8)}`,
      payload: { type: "VENUE_CLAIM_VERIFY", venueName: venue.name, venueSlug: venue.slug, verifyUrl, expiresAt: result.expiresAt.toISOString() },
    });

    return NextResponse.json({ ok: true, expiresAt: result.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
