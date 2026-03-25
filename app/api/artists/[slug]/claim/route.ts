import { createHmac } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import {
  RATE_LIMITS,
  enforceRateLimit,
  isRateLimitError,
  principalRateLimitKey,
  rateLimitErrorResponse,
} from "@/lib/rate-limit";
import { parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

const claimSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(240),
});

const TTL_MS = 60 * 60 * 1000;

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return "artist-claim-dev-secret"; // dev/test only
  }
  return secret;
}

function signToken(payload: object) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  noStore();
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artists:claim"),
      ...RATE_LIMITS.publicWrite,
    });

    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return apiError(403, "forbidden", "Cross-origin requests are not permitted");
        }
      } catch {
        return apiError(400, "invalid_request", "Invalid origin");
      }
    }

    const { slug } = await ctx.params;
    const parsed = claimSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const artist = await db.artist.findFirst({
      where: { slug, isPublished: true, deletedAt: null },
      select: { id: true, slug: true, name: true, userId: true },
    });
    if (!artist) return apiError(404, "not_found", "Artist not found");
    if (artist.userId) return apiError(409, "already_claimed", "Artist profile is already claimed");

    const expiresAt = Date.now() + TTL_MS;
    const token = signToken({ slug: artist.slug, email: parsed.data.email.toLowerCase(), claimantName: parsed.data.name, exp: expiresAt });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/artists/${encodeURIComponent(artist.slug)}/claim/verify?token=${encodeURIComponent(token)}`;

    await enqueueNotification({
      type: "BROADCAST",
      toEmail: parsed.data.email,
      dedupeKey: `artist-claim-verify:${artist.slug}:${expiresAt}`,
      payload: {
        subject: `Verify your claim for ${artist.name}`,
        bodyHtml: `<p>Please verify your claim for <strong>${artist.name}</strong>.</p><p><a href="${verifyUrl}">Verify claim</a></p>`,
        unsubscribeUrl: `${baseUrl}/settings/notifications`,
      },
    });

    return NextResponse.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
