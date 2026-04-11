import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.max(1, Math.min(200, Number.parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10)));
    const unmatchedRaw = req.nextUrl.searchParams.get("unmatched");
    const unmatched = unmatchedRaw === "1" || unmatchedRaw === "true";

    const where = {
      directorySourceId: parsedParams.data.id,
      ...(unmatched ? { matchedArtistId: null } : {}),
    };

    const [entities, total] = await Promise.all([
      db.directoryEntity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          entityUrl: true,
          entityName: true,
          matchedArtistId: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      db.directoryEntity.count({ where }),
    ]);

    return NextResponse.json({
      entities: entities.map((entity) => ({
        ...entity,
        lastSeenAt: entity.lastSeenAt.toISOString(),
        createdAt: entity.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_id_entities_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const sourceId = parsedParams.data.id;

    const source = await db.directorySource.findUnique({
      where: { id: sourceId },
      select: { id: true, baseUrl: true },
    });
    if (!source) return apiError(404, "not_found", "Directory source not found");

    const allEntities = await db.directoryEntity.findMany({
      where: { directorySourceId: sourceId },
      select: { id: true, entityName: true, entityUrl: true },
    });

    const invalidIds = allEntities
      .filter((entity) => {
        if (!entity.entityName || entity.entityName.trim().length < 3) return true;
        try {
          const url = new URL(entity.entityUrl);
          const basePath = new URL(source.baseUrl).pathname.replace(/\/$/, "");
          const remainder = url.pathname.slice(basePath.length).replace(/^\//, "");
          if (/^[a-zA-Z]?\/?$/.test(remainder)) return true;
        } catch {
          return true;
        }
        return false;
      })
      .map((entity) => entity.id);

    if (invalidIds.length === 0) {
      return NextResponse.json({ deleted: 0 }, { headers: { "Cache-Control": "no-store" } });
    }

    const { count } = await db.directoryEntity.deleteMany({
      where: { id: { in: invalidIds } },
    });

    await db.directoryCursor.updateMany({
      where: { directorySourceId: sourceId },
      data: { currentLetter: "A", currentPage: 1 },
    });

    return NextResponse.json({ deleted: count }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_entities_delete_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
