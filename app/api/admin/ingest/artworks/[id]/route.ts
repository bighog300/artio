import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

const patchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  artistName: z.string().trim().max(200).nullable().optional(),
  medium: z.string().trim().max(200).nullable().optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  dimensions: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return apiError(400, "invalid_request", "Invalid candidate ID");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());
    }

    const candidate = await db.ingestExtractedArtwork.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, status: true },
    });

    if (!candidate) {
      return apiError(404, "not_found", "Artwork candidate not found");
    }
    if (candidate.status !== "PENDING") {
      return apiError(400, "not_pending", "Only PENDING candidates can be edited");
    }

    const updated = await db.ingestExtractedArtwork.update({
      where: { id: parsedParams.data.id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.artistName !== undefined && { artistName: parsed.data.artistName }),
        ...(parsed.data.medium !== undefined && { medium: parsed.data.medium }),
        ...(parsed.data.year !== undefined && { year: parsed.data.year }),
        ...(parsed.data.dimensions !== undefined && { dimensions: parsed.data.dimensions }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl }),
      },
      select: {
        id: true,
        title: true,
        artistName: true,
        medium: true,
        year: true,
        dimensions: true,
        description: true,
        imageUrl: true,
        status: true,
      },
    });

    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
