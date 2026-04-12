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
  name: z.string().trim().min(1).max(200).optional(),
  bio: z.string().trim().max(5000).nullable().optional(),
  mediums: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  collections: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  nationality: z.string().trim().max(100).nullable().optional(),
  birthYear: z.number().int().min(1800).max(2100).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  instagramUrl: z.string().url().nullable().optional(),
  twitterUrl: z.string().url().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
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

    const candidate = await db.ingestExtractedArtist.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, status: true },
    });

    if (!candidate) {
      return apiError(404, "not_found", "Artist candidate not found");
    }
    if (candidate.status !== "PENDING") {
      return apiError(400, "not_pending", "Only PENDING candidates can be edited");
    }

    const updated = await db.ingestExtractedArtist.update({
      where: { id: parsedParams.data.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.bio !== undefined && { bio: parsed.data.bio }),
        ...(parsed.data.mediums !== undefined && { mediums: parsed.data.mediums }),
        ...(parsed.data.collections !== undefined && { collections: parsed.data.collections }),
        ...(parsed.data.nationality !== undefined && { nationality: parsed.data.nationality }),
        ...(parsed.data.birthYear !== undefined && { birthYear: parsed.data.birthYear }),
        ...(parsed.data.websiteUrl !== undefined && { websiteUrl: parsed.data.websiteUrl }),
        ...(parsed.data.instagramUrl !== undefined && { instagramUrl: parsed.data.instagramUrl }),
        ...(parsed.data.twitterUrl !== undefined && { twitterUrl: parsed.data.twitterUrl }),
        ...(parsed.data.avatarUrl !== undefined && { avatarUrl: parsed.data.avatarUrl }),
      },
      select: {
        id: true,
        name: true,
        bio: true,
        mediums: true,
        collections: true,
        nationality: true,
        birthYear: true,
        websiteUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        avatarUrl: true,
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
