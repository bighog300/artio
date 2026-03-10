import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const tagCategorySchema = z.enum(["medium", "genre", "movement", "mood"]);
const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase and hyphenated"),
  category: tagCategorySchema,
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const parsed = tagCreateSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const existing = await db.tag.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (existing) return apiError(409, "conflict", "Tag slug already exists");

    const tag = await db.tag.create({ data: parsed.data });
    return Response.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
