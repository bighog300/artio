import { unstable_noStore as noStore } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { createArtworkInquiry } from "@/lib/artwork-inquiry";
import { enqueueNotification } from "@/lib/notifications";
import { parseBody, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const enquireSchema = z.object({
  buyerName: z.string().trim().min(2).max(100),
  buyerEmail: z.string().trim().toLowerCase().email(),
  message: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  noStore();
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artwork:enquire"),
      ...RATE_LIMITS.publicWrite,
    });

    const { key } = await ctx.params;
    const parsed = enquireSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const artwork = await db.artwork.findFirst({
      where: isArtworkIdKey(key) ? { id: key, deletedAt: null } : { slug: key, deletedAt: null },
      select: { id: true },
    });
    if (!artwork) return apiError(404, "not_found", "Artwork not found");

    const result = await createArtworkInquiry({
      db: db as never,
      artworkId: artwork.id,
      buyerName: parsed.data.buyerName,
      buyerEmail: parsed.data.buyerEmail,
      message: parsed.data.message,
      notify: async ({ buyerEmail, artistEmail, artworkTitle, artworkSlug, artistName, buyerName, message, priceFormatted, inquiryId }) => {
        await enqueueNotification({
          type: "ARTWORK_INQUIRY_BUYER",
          toEmail: buyerEmail,
          dedupeKey: `artwork-inquiry:${inquiryId}:buyer`,
          payload: {
            type: "ARTWORK_INQUIRY_BUYER",
            artworkTitle,
            artworkSlug,
            artistName,
            priceFormatted,
            inquiryId,
          },
        });

        const fallbackEmail = process.env.INQUIRY_FALLBACK_EMAIL?.trim() || null;
        const deliveryEmail = artistEmail ?? fallbackEmail;

        if (deliveryEmail) {
          await enqueueNotification({
            type: "ARTWORK_INQUIRY_ARTIST",
            toEmail: deliveryEmail,
            replyTo: buyerEmail,
            dedupeKey: `artwork-inquiry:${inquiryId}:artist`,
            payload: {
              type: "ARTWORK_INQUIRY_ARTIST",
              artworkTitle,
              artworkSlug,
              buyerName,
              buyerEmail,
              message,
              priceFormatted,
              inquiryId,
            },
          });
        }

        return { deliveredTo: deliveryEmail ?? "" };
      },
    });

    if (!result) return apiError(404, "not_found", "Artwork not found");

    return Response.json({ inquiryId: result.inquiryId, deliveredTo: result.deliveredTo }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
