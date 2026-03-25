import { NextRequest } from "next/server";
import { isAuthError, requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { adminEventCreateSchema, parseBody, zodDetails } from "@/lib/validators";
import { handleAdminEntityList } from "@/lib/admin-events-route";
import { requireAdmin } from "@/lib/admin";
import { isForbiddenError } from "@/lib/http-errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityList(req, { requireAdminUser: requireAdmin, appDb: db });
}

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
    const parsed = adminEventCreateSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
    const { startAt, endAt, isPublished, tagSlugs = [], artistSlugs = [], images = [], ...rest } = parsed.data;

    const item = await db.event.create({
      data: {
        ...rest,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        isPublished: Boolean(isPublished),
        status: isPublished ? "PUBLISHED" : "DRAFT",
        publishedAt: isPublished ? new Date() : null,
        eventTags: tagSlugs.length ? { create: tagSlugs.map((slug) => ({ tag: { connect: { slug } } })) } : undefined,
        eventArtists: artistSlugs.length ? { create: artistSlugs.map((slug) => ({ artist: { connect: { slug } } })) } : undefined,
        images: images.length ? { create: images.map((image) => ({ assetId: image.assetId ?? null, url: image.url ?? "", alt: image.alt ?? null, sortOrder: image.sortOrder })) } : undefined,
      },
      include: { eventTags: { include: { tag: true } }, eventArtists: { include: { artist: true } }, images: true },
    });
    return Response.json(item, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Editor role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
