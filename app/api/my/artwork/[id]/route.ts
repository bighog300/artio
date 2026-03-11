import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { artworkSlugSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";

export const runtime = "nodejs";

const artworkPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: artworkSlugSchema.optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  year: z.number().int().min(1000).max(3000).optional().nullable(),
  medium: z.string().trim().max(200).optional().nullable(),
  dimensions: z.string().trim().max(200).optional().nullable(),
  priceAmount: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
  condition: z.string().trim().max(100).optional().nullable(),
  conditionNotes: z.string().trim().max(500).optional().nullable(),
  provenance: z.string().trim().max(1000).optional().nullable(),
  editionInfo: z.string().trim().max(100).optional().nullable(),
  frameIncluded: z.boolean().optional().nullable(),
  shippingNotes: z.string().trim().max(500).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  try {
    await requireMyArtworkAccess(parsedId.data.id);
    const artwork = await db.artwork.findUnique({ where: { id: parsedId.data.id }, include: { images: { include: { asset: true }, orderBy: { sortOrder: "asc" } }, venues: true, events: true } });
    if (!artwork) return apiError(404, "not_found", "Artwork not found");
    const completeness = computeArtworkCompleteness(artwork, artwork.images.length);
    return NextResponse.json({ artwork, completeness });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  try {
    const { user } = await requireMyArtworkAccess(parsedId.data.id);
    const body = await parseBody(req);
    const parsedBody = artworkPatchSchema.safeParse(body);
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const before = await db.artwork.findUnique({ where: { id: parsedId.data.id } });
    if (!before) return apiError(404, "not_found", "Artwork not found");

    const data = { ...parsedBody.data };

    if (data.slug !== undefined) {
      if (data.slug === null) {
        data.slug = null;
      } else {
        data.slug = await ensureUniqueArtworkSlugWithDeps(
          { findBySlug: (candidate) => db.artwork.findUnique({ where: { slug: candidate }, select: { id: true } }) },
          data.slug,
          parsedId.data.id,
        );
      }
    } else if (data.title !== undefined && before.slug === null) {
      data.slug = await ensureUniqueArtworkSlugWithDeps(
        { findBySlug: (candidate) => db.artwork.findUnique({ where: { slug: candidate }, select: { id: true } }) },
        slugifyArtworkTitle(data.title),
        parsedId.data.id,
      );
    }

    const artwork = await db.artwork.update({ where: { id: parsedId.data.id }, data });
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_UPDATED", targetType: "artwork", targetId: artwork.id, metadata: { before, after: data }, req });
    return NextResponse.json({ artwork });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(409, "conflict", "Artwork slug already exists");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
