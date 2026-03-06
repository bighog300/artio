import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { myArtistPatchSchema, parseBody, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

type SessionUser = { id: string };
type ArtistRecord = {
  id: string;
  name: string;
  bio: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  avatarImageUrl: string | null;
  featuredAssetId: string | null;
  mediums?: string[];
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  findOwnedArtistByUserId: (userId: string) => Promise<ArtistRecord | null>;
  updateArtistById: (artistId: string, patch: Partial<Omit<ArtistRecord, "id">>) => Promise<ArtistRecord>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function handlePatchMyArtist(req: NextRequest, deps: Deps) {
  try {
    const user = await deps.requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-profile:patch:${user.id}`, user.id),
      limit: RATE_LIMITS.artistProfileWrite.limit,
      windowMs: RATE_LIMITS.artistProfileWrite.windowMs,
    });

    const artist = await deps.findOwnedArtistByUserId(user.id);
    if (!artist) return NextResponse.json({ error: { code: "forbidden", message: "Artist profile required" } }, { status: 403, headers: NO_STORE_HEADERS });

    const parsedBody = myArtistPatchSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const updated = await deps.updateArtistById(artist.id, parsedBody.data);
    return NextResponse.json({ artist: updated }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
