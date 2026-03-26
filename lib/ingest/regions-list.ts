import { db } from "@/lib/db";

type RegionsListDb = Pick<typeof db, "ingestRegion">;

export type RegionsListPayload = {
  regions: Array<{
    id: string;
    country: string;
    region: string;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PAUSED";
    venueGenDone: boolean;
    discoveryDone: boolean;
    createdAt: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
    errorMessage: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export async function listIngestRegions(args: { db: RegionsListDb; page?: number; pageSize?: number }): Promise<RegionsListPayload> {
  const page = Number.isFinite(args.page) && (args.page ?? 0) > 0 ? Math.trunc(args.page as number) : 1;
  const pageSize = Number.isFinite(args.pageSize) && (args.pageSize ?? 0) > 0 ? Math.trunc(args.pageSize as number) : 20;

  const [regions, total] = await Promise.all([
    args.db.ingestRegion.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    args.db.ingestRegion.count(),
  ]);

  return {
    regions: regions.map((region) => ({
      ...region,
      createdAt: region.createdAt.toISOString(),
      lastRunAt: region.lastRunAt?.toISOString() ?? null,
      nextRunAt: region.nextRunAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}
