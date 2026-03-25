import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { handleArtistClaimVerify } from "@/lib/artist-claim-verify";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  noStore();
  try {
    const { slug } = await ctx.params;
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) return apiError(400, "invalid_request", "token is required");

    const result = await handleArtistClaimVerify(slug, token, {
      appDb: db,
      notify: enqueueNotification,
    });

    if (!result.ok) {
      if (result.reason === "invalid_token") return apiError(400, "invalid_token", "Token is invalid or expired");
      if (result.reason === "not_found") return apiError(404, "not_found", "Artist not found");
      if (result.reason === "already_claimed") return apiError(409, "already_claimed", "Artist profile is already claimed");
    }

    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_token") return apiError(400, "invalid_token", "Token is invalid or expired");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
