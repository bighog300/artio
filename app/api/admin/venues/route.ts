import { NextRequest } from "next/server";
import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { adminVenueCreateSchema, parseBody, zodDetails } from "@/lib/validators";
import { handleAdminEntityList } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityList(req, "venues", { requireAdminUser: requireAdmin, appDb: db });
}

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
    const parsed = adminVenueCreateSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
    const item = await db.venue.create({ data: { ...parsed.data, status: parsed.data.isPublished ? "PUBLISHED" : "DRAFT" } });
    return Response.json(item, { status: 201 });
  } catch {
    return apiError(403, "forbidden", "Editor role required");
  }
}
