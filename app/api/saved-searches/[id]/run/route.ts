import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { idParamSchema, paramsToObject, zodDetails } from "@/lib/validators";
import { runSavedSearchEvents } from "@/lib/saved-searches";
import { z } from "zod";

export const runtime = "nodejs";

const runQuerySchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as { id?: string; startAt?: string };
    if (!parsed.id || !parsed.startAt) return null;
    const startAt = new Date(parsed.startAt);
    if (Number.isNaN(startAt.getTime())) return null;
    return { id: parsed.id, startAt };
  } catch {
    return null;
  }
}

function encodeCursor(item: { id: string; startAt: Date }) {
  return Buffer.from(JSON.stringify({ id: item.id, startAt: item.startAt.toISOString() })).toString("base64url");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const parsedQuery = runQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
    if (!parsedQuery.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsedQuery.error));

    const saved = await db.savedSearch.findFirst({ where: { id: parsedId.data.id, userId: user.id } });
    if (!saved) return apiError(404, "not_found", "Saved search not found");

    const hiddenEventIds = (await db.engagementEvent.findMany({
      where: { userId: user.id, action: "HIDE", targetType: "EVENT" },
      select: { targetId: true },
      distinct: ["targetId"],
    })).map((item) => item.targetId);

    const decoded = parsedQuery.data.cursor ? decodeCursor(parsedQuery.data.cursor) : null;
    const items = await runSavedSearchEvents({ eventDb: db as never, type: saved.type, paramsJson: saved.paramsJson, cursor: decoded, limit: parsedQuery.data.limit, hiddenEventIds });
    const hasMore = items.length > parsedQuery.data.limit;
    const page = hasMore ? items.slice(0, parsedQuery.data.limit) : items;
    return NextResponse.json({ items: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null });
  } catch (error: unknown) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Login required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
