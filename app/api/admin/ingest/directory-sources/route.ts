import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSafeUrl } from "@/lib/ingest/url-guard";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  baseUrl: z.string().url(),
  indexPattern: z.string().trim().min(5).max(500).refine((v) => v.includes("[letter]"), {
    message: "indexPattern must include [letter]",
  }),
  linkPattern: z.string().trim().min(1).max(500).optional().nullable(),
  entityType: z.enum(["ARTIST", "VENUE"]),
  crawlIntervalMinutes: z.number().int().min(60).max(525600).optional().default(10080),
  maxPagesPerLetter: z.number().int().min(1).max(50).optional().default(5),
});

export async function GET() {
  noStore();
  try {
    await requireAdmin();
    const sources = await db.directorySource.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cursor: {
          select: {
            currentLetter: true,
            currentPage: true,
            lastRunAt: true,
            lastSuccessAt: true,
            lastError: true,
          },
        },
        _count: {
          select: { entities: true },
        },
      },
    });

    return NextResponse.json({
      sources: sources.map((source) => ({
        ...source,
        createdAt: source.createdAt.toISOString(),
        cursor: source.cursor
          ? {
            ...source.cursor,
            lastRunAt: source.cursor.lastRunAt?.toISOString() ?? null,
            lastSuccessAt: source.cursor.lastSuccessAt?.toISOString() ?? null,
          }
          : null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());
    }

    await assertSafeUrl(parsed.data.baseUrl);

    const source = await db.directorySource.create({
      data: {
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        indexPattern: parsed.data.indexPattern,
        entityType: parsed.data.entityType,
        crawlIntervalMinutes: parsed.data.crawlIntervalMinutes,
        maxPagesPerLetter: parsed.data.maxPagesPerLetter,
        linkPattern: parsed.data.linkPattern || null,
        cursor: {
          create: {
            currentLetter: "A",
            currentPage: 1,
          },
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ sourceId: source.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
