import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const tagCategorySchema = z.enum(["medium", "genre", "movement", "mood"]);
const idSchema = z.object({ id: z.string().uuid() });
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase and hyphenated").optional(),
    category: tagCategorySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const parsedParams = idSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", parsedParams.error.flatten());

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const tag = await db.tag.update({ where: { id: parsedParams.data.id }, data: parsed.data });
    return Response.json(tag);
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      return apiError(404, "not_found", "Tag not found");
    }
    if (error instanceof Error && error.message.includes("Unique constraint failed")) {
      return apiError(409, "conflict", "Tag slug already exists");
    }
    console.error("admin_tags_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const parsedParams = idSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", parsedParams.error.flatten());

    const count = await db.eventTag.count({ where: { tagId: parsedParams.data.id } });
    if (count > 0) return Response.json({ error: "tag_in_use", count }, { status: 409 });

    await db.tag.delete({ where: { id: parsedParams.data.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    if (error instanceof Error && error.message.includes("Record to delete does not exist")) {
      return apiError(404, "not_found", "Tag not found");
    }
    console.error("admin_tags_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
