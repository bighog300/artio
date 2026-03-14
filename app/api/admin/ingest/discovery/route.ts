import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDiscoveryJob } from "@/lib/ingest/run-discovery-job";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const createSchema = z.object({
  entityType: z.enum(["VENUE", "ARTIST", "EVENT"]),
  queryTemplate: z.string().min(3).max(500),
  region: z.string().max(100).optional().default(""),
  searchProvider: z.enum(["google_pse", "brave"]).optional().default("google_pse"),
  maxResults: z.number().int().min(1).max(50).optional().default(10),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const page = Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = 20;

    const [jobs, total] = await Promise.all([
      db.ingestDiscoveryJob.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { candidates: true } } },
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      db.ingestDiscoveryJob.count(),
    ]);

    return NextResponse.json({ jobs, total, page: pageNumber, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const job = await db.ingestDiscoveryJob.create({
      data: {
        entityType: parsed.data.entityType,
        queryTemplate: parsed.data.queryTemplate,
        region: parsed.data.region,
        searchProvider: parsed.data.searchProvider,
        maxResults: parsed.data.maxResults,
        status: "PENDING",
      },
      select: { id: true },
    });

    void (async () => {
      const settings = await db.siteSettings.findUnique({
        where: { id: "default" },
        select: { googlePseApiKey: true, googlePseCx: true, braveSearchApiKey: true },
      });
      await runDiscoveryJob({
        db,
        jobId: job.id,
        env: {
          googlePseApiKey: settings?.googlePseApiKey,
          googlePseCx: settings?.googlePseCx,
          braveSearchApiKey: settings?.braveSearchApiKey,
        },
      });
    })();

    return NextResponse.json({ jobId: job.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
