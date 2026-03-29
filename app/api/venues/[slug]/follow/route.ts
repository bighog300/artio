import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { slugParamSchema, zodDetails } from "@/lib/validators";
import { followStatusResponse, getFollowersCount } from "@/lib/follow-counts";
import { publishedVenueWhere } from "@/lib/publish-status";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  // GET only — returns follow status and follower count for a venue.
  // Both artist and venue follow toggles are handled by POST /api/follows
  // and DELETE /api/follows — neither entity-specific follow route has
  // a write handler.
  const parsed = slugParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));

  const venue = await db.venue.findFirst({ where: { slug: parsed.data.slug, ...publishedVenueWhere() }, select: { id: true } });
  if (!venue) return apiError(404, "not_found", "Venue not found");

  const user = await getSessionUser();
  const [followersCount, follow] = await Promise.all([
    getFollowersCount("VENUE", venue.id),
    user ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "VENUE", targetId: venue.id } }, select: { id: true } }) : Promise.resolve(null),
  ]);

  return NextResponse.json(followStatusResponse({ followersCount, isAuthenticated: Boolean(user), hasFollow: Boolean(follow) }));
}
