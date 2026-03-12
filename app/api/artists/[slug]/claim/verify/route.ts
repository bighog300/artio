import { createHmac, timingSafeEqual } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

function getSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "artist-claim-dev-secret";
}

function verifyToken(rawToken: string) {
  const [encoded, signature] = rawToken.split(".");
  if (!encoded || !signature) throw new Error("invalid_token");
  const expected = createHmac("sha256", getSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("invalid_token");

  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { slug?: string; email?: string; claimantName?: string; exp?: number };
  if (!parsed.slug || !parsed.email || !parsed.claimantName || !parsed.exp) throw new Error("invalid_token");
  if (Date.now() > parsed.exp) throw new Error("invalid_token");
  return parsed;
}

async function resolveAdminRecipients() {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  return Array.from(new Set(admins.map((row) => row.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email))));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  noStore();
  try {
    const { slug } = await ctx.params;
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) return apiError(400, "invalid_request", "token is required");

    const payload = verifyToken(token);
    if (payload.slug !== slug) return apiError(400, "invalid_token", "Token is invalid or expired");

    const artist = await db.artist.findFirst({ where: { slug, isPublished: true, deletedAt: null }, select: { id: true, slug: true, name: true, userId: true } });
    if (!artist) return apiError(404, "not_found", "Artist not found");
    if (artist.userId) return apiError(409, "already_claimed", "Artist profile is already claimed");

    await db.artist.update({
      where: { id: artist.id },
      data: { status: "IN_REVIEW", reviewNotes: `Claim requested by ${payload.claimantName} <${payload.email}>` },
    });

    const adminRecipients = await resolveAdminRecipients();
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
    await Promise.all(adminRecipients.map((email) => enqueueNotification({
      type: "BROADCAST",
      toEmail: email,
      dedupeKey: `artist-claim-admin:${artist.id}:${payload.email}`,
      payload: {
        subject: `Artist claim requires moderation: ${artist.name}`,
        bodyHtml: `<p>${payload.claimantName} (${payload.email}) verified a claim for <a href="${baseUrl}/artists/${artist.slug}">${artist.name}</a>.</p>`,
        unsubscribeUrl: `${baseUrl}/settings/notifications`,
      },
    })));

    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_token") return apiError(400, "invalid_token", "Token is invalid or expired");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
